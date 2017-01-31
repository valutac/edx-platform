/**
 * MoveXBlockBreadcrumb shows back button and breadcrumb to move back to parent.
 */
define([
    'jquery', 'backbone', 'underscore', 'gettext',
    'edx-ui-toolkit/js/utils/html-utils',
    'edx-ui-toolkit/js/utils/string-utils',
    'text!templates/move-xblock-breadcrumb.underscore'
],
function($, Backbone, _, gettext, HtmlUtils, StringUtils, MoveXBlockBreadcrumbViewTemplate) {
    'use strict';

    var MoveXBlockBreadcrumb = Backbone.View.extend({
        el: '.breadcrumb-container',

        defaultRenderOptions: {
            breadcrumbs: ['Course Outline']
        },

        events: {
            'click .parent-nav-button': 'handleBreadcrumbButtonPress'
        },

        initialize: function() {
            this.template = HtmlUtils.template(MoveXBlockBreadcrumbViewTemplate);
            this.listenTo(Backbone, 'move:childrenRendered', this.updateView);
        },

        render: function(options) {
            HtmlUtils.setHtml(
                this.$el,
                this.template(_.extend({}, this.defaultRenderOptions, options))
            );
            Backbone.trigger('move:breadcrumbRendered');
            return this;
        },

        handleBreadcrumbButtonPress: function(event) {
            Backbone.trigger(
                'move:breadcrumbButtonPressed',
                $(event.target).data('parentIndex')
            );
        },

        updateView: function(args) {
            this.render(args);
        }
    });

    return MoveXBlockBreadcrumb;
});
