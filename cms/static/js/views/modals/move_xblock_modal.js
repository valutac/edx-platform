/**
 * The MoveXblockModal to move XBlocks in course.
 */
define([
    'jquery', 'backbone', 'underscore', 'gettext',
    'js/views/baseview', 'js/views/modals/base_modal',
    'js/models/xblock_info', 'js/views/move_xblock_list', 'js/views/move_xblock_breadcrumb',
    'js/views/utils/xblock_utils',
    'common/js/components/views/feedback_move',
    'edx-ui-toolkit/js/utils/html-utils',
    'edx-ui-toolkit/js/utils/string-utils',
    'text!templates/move-xblock-modal.underscore'
],
function($, Backbone, _, gettext, BaseView, BaseModal, XBlockInfoModel, MoveXBlockListView, MoveXBlockBreadcrumbView,
         MovedAlertView, XBlockViewUtils, HtmlUtils, StringUtils, MoveXblockModalTemplate) {
    'use strict';

    var MoveXblockModal = BaseModal.extend({
        modalSRTitle: gettext('Choose a location to move your component to'),

        events: _.extend({}, BaseModal.prototype.events, {
            'click .action-move': 'moveXBlock'
        }),

        options: $.extend({}, BaseModal.prototype.options, {
            modalName: 'move-xblock',
            modalSize: 'ml',
            addPrimaryActionButton: true,
            primaryActionButtonType: 'move',
            viewSpecificClasses: 'move-modal',
            primaryActionButtonTitle: gettext('Move'),
            modalSRTitle: gettext('Choose a location to move your component to')
        }),

        initialize: function() {
            BaseModal.prototype.initialize.call(this);
            this.listenTo(Backbone, 'move:breadcrumbRendered', this.focusModal);
            this.sourceXBlockInfo = this.options.sourceXBlockInfo;
            this.XBlockUrlRoot = this.options.XBlockUrlRoot;
            this.XBlockAncestorInfoUrl = StringUtils.interpolate(
                '{urlRoot}/{usageId}?fields=ancestorInfo',
                {urlRoot: this.XBlockUrlRoot, usageId: this.sourceXBlockInfo.get('id')}
            );
            this.outlineURL = this.options.outlineURL;
            this.options.title = this.getTitle();
            this.fetchCourseOutline();
            this.targetParentXBlockInfo = null;
            this.movedAlertView = null;
        },

        getTitle: function() {
            return StringUtils.interpolate(
                gettext('Move: {displayName}'),
                {displayName: this.sourceXBlockInfo.get('display_name')}
            );
        },

        getContentHtml: function() {
            return _.template(MoveXblockModalTemplate)({});
        },

        show: function() {
            BaseModal.prototype.show.apply(this, [false]);
        },

        hide: function() {
            if (this.moveXBlockListView) {
                this.moveXBlockListView.remove();
            }
            if (this.moveXBlockBreadcrumbView) {
                this.moveXBlockBreadcrumbView.remove();
            }
            BaseModal.prototype.hide.apply(this);
            Feedback.prototype.outFocus.apply(this);
        },

        focusModal: function() {
            Feedback.prototype.inFocus.apply(this, [this.options.modalWindowClass]);
        },

        fetchCourseOutline: function() {
            var self = this;
            $.when(
                this.fetchData(this.outlineURL),
                this.fetchData(this.XBlockAncestorInfoUrl)
            ).then(function(courseOutlineInfo, ancestorInfo) {
                $('.ui-loading').addClass('is-hidden');
                $('.breadcrumb-container').removeClass('is-hidden');
                self.renderViews(courseOutlineInfo, ancestorInfo);
            });
        },

        fetchData: function(url) {
            var deferred = $.Deferred();
            $.ajax({
                url: url,
                contentType: 'application/json',
                dataType: 'json',
                type: 'GET'
            }).done(function(data) {
                deferred.resolve(data);
            }).fail(function() {
                deferred.reject();
            });
            return deferred.promise();
        },

        renderViews: function(courseOutlineInfo, ancestorInfo) {
            this.moveXBlockBreadcrumbView = new MoveXBlockBreadcrumbView({});
            this.moveXBlockListView = new MoveXBlockListView(
                {
                    model: new XBlockInfoModel(courseOutlineInfo, {parse: true}),
                    ancestorInfo: ancestorInfo
                }
            );
        },

        showMovedBar: function (title, titleLink, messageLink) {
            var self = this;
            if (self.movedAlertView) {
                self.movedAlertView.hide();
            }
            self.movedAlertView = new MovedAlertView({
                title: title,
                titleLink: titleLink,
                messageLink: messageLink,
                maxShown: 10000
            });
            self.movedAlertView.show();
            // scroll to top
            $.smoothScroll({
                offset: 0,
                easing: 'swing',
                speed: 1000
            });
        },

        moveXBlock: function () {
            var self = this;
            XBlockViewUtils.moveXBlock(self.sourceXBlockInfo.id, self.targetParentXBlockInfo.id)
                .done(function (response) {
                    if (response.move_source_locator) {
                        // hide modal
                        self.hide();
                        // hide xblock placeholder
                        $("li.studio-xblock-wrapper[data-locator='" + self.sourceXBlockInfo.id + "']").hide();
                        self.showMovedBar(
                            StringUtils.interpolate(
                                gettext('Success! "{displayName}" has been moved to a new location.'),
                                {
                                    displayName: self.sourceXBlockInfo.get('display_name')
                                }
                            ),
                            StringUtils.interpolate(
                                gettext(' {link_start}Take me there{link_end}'),
                                {
                                    link_start: HtmlUtils.HTML('<a href="/container/' + response.parent_locator + '">'),
                                    link_end: HtmlUtils.HTML('</a>')
                                }
                            ),
                            HtmlUtils.interpolateHtml(
                                HtmlUtils.HTML('<a class="action-undo-move" href="#" data-source-display-name="{displayName}" data-source-locator="{sourceLocator}" data-parent-locator="{parentLocator}" data-target-index="{targetIndex}">{undoMove}</a>'),
                                {
                                    displayName: self.sourceXBlockInfo.get('display_name'),
                                    sourceLocator: self.sourceXBlockInfo.id,
                                    parentLocator: self.sourceParentXBlockInfo.id,
                                    targetIndex: response.source_index,
                                    undoMove: gettext('Undo move')
                                }
                            )
                        );
                    }
                });
        }
    });

    return MoveXblockModal;
});
