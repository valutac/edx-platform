define(['jquery', 'underscore', 'edx-ui-toolkit/js/utils/spec-helpers/ajax-helpers',
        'common/js/spec_helpers/template_helpers', 'common/js/spec_helpers/view_helpers',
        'js/views/modals/move_xblock_modal', 'edx-ui-toolkit/js/utils/html-utils',
        'edx-ui-toolkit/js/utils/string-utils', 'js/models/xblock_info'],
    function($, _, AjaxHelpers, TemplateHelpers, ViewHelpers, MoveXBlockModal, HtmlUtils, StringUtils, XBlockInfo) {
        'use strict';
        describe('MoveXBlock', function() {
            var renderViews, createXBlockInfo, createCourseOutline, moveXBlockBreadcrumbView,
                moveXBlockListView, parentToChildMap, categoryMap, createChildXBlockInfo,
                verifyBreadcrumbViewInfo, verifyListViewInfo, getDisplayedInfo, clickForwardButton,
                clickBreadcrumbButton, verifyXBlockInfo, nextCategory;

            var modal,
                showModal,
                sourceDisplayName = 'HTML 101',
                sourceLocator = 'source-xblock-locator',
                sourceParentLocator = 'source-parent-xblock-locator';

            parentToChildMap = {
                course: 'section',
                section: 'subsection',
                subsection: 'unit',
                unit: 'component'
            };

            categoryMap = {
                section: 'chapter',
                subsection: 'sequential',
                unit: 'vertical',
                component: 'component'
            };

            beforeEach(function() {
                TemplateHelpers.installTemplates([
                    'basic-modal',
                    'modal-button',
                    'move-xblock-modal'
                ]);
                showModal();
            });

            afterEach(function() {
                modal.hide();
            });

            showModal = function() {
                modal = new MoveXBlockModal({
                    sourceXBlockInfo: new XBlockInfo({
                        id: sourceLocator,
                        display_name: sourceDisplayName,
                        category: 'html'
                    }),
                    sourceParentXBlockInfo: new XBlockInfo({
                        id: sourceParentLocator,
                        display_name: 'VERT 101',
                        category: 'vertical'
                    }),
                    XBlockUrlRoot: '/xblock'
                });
                modal.show();
            };

            createChildXBlockInfo = function(category, options, xblockIndex) {
                var cInfo =
                    {
                        category: categoryMap[category],
                        display_name: category + '_display_name_' + xblockIndex,
                        id: category + '_ID'
                    };

                return createXBlockInfo(parentToChildMap[category], options, cInfo);
            };

            createXBlockInfo = function(category, options, outline) {
                var cInfo =
                    {
                        category: categoryMap[category],
                        display_name: category,
                        children: []
                    },
                    xblocks;

                xblocks = options[category];
                if (!xblocks) {
                    return outline;
                }

                outline.child_info = cInfo; // eslint-disable-line no-param-reassign
                _.each(_.range(xblocks), function(xblockIndex) {
                    cInfo.children.push(
                        createChildXBlockInfo(category, options, xblockIndex)
                    );
                });
                return outline;
            };

            createCourseOutline = function(options) {
                var courseOutline = {
                    category: 'course',
                    display_name: 'Demo Course',
                    id: 'COURSE_ID_101'
                };

                return createXBlockInfo('section', options, courseOutline);
            };

            renderViews = function(courseOutlineJson, ancestorInfo) {
                var ancestorInfo = ancestorInfo || {ancestors: []};
                modal.renderViews(courseOutlineJson, ancestorInfo);
            };

            getDisplayedInfo = function() {
                var viewEl = modal.moveXBlockListView.$el;
                return {
                    categoryText: viewEl.find('.category-text').text().trim(),
                    currentLocationText: viewEl.find('.current-location').text().trim(),
                    xblockCount: viewEl.find('.xblock-item').length,
                    xblockDisplayNames: viewEl.find('.xblock-item .xblock-displayname').map(
                        function() { return $(this).text().trim(); }
                    ).get(),
                    forwardButtonSRTexts: viewEl.find('.xblock-item .forward-sr-text').map(
                        function() { return $(this).text().trim(); }
                    ).get(),
                    forwardButtonCount: viewEl.find('.fa-arrow-right.forward-sr-icon').length
                };
            };

            verifyListViewInfo = function(category, expectedXBlocksCount, hasCurrentLocation) {
                var displayedInfo = getDisplayedInfo();
                expect(displayedInfo.categoryText).toEqual(modal.moveXBlockListView.categoriesText[category] + ':');
                expect(displayedInfo.xblockCount).toEqual(expectedXBlocksCount);
                expect(displayedInfo.xblockDisplayNames).toEqual(
                    _.map(_.range(expectedXBlocksCount), function(xblockIndex) {
                        return category + '_display_name_' + xblockIndex;
                    })
                );
                if (category !== 'component') {
                    if (hasCurrentLocation) {
                        expect(displayedInfo.currentLocationText).toEqual('(Current location)');
                    }
                    expect(displayedInfo.forwardButtonSRTexts).toEqual(
                        _.map(_.range(expectedXBlocksCount), function() {
                            return 'Press button to see ' + category + ' childs';
                        })
                    );
                    expect(displayedInfo.forwardButtonCount).toEqual(expectedXBlocksCount);
                }
            };

            verifyBreadcrumbViewInfo = function(category, xblockIndex) {
                var displayedBreadcrumbs = modal.moveXBlockBreadcrumbView.$el.find('.breadcrumbs .bc-container').map(
                    function() { return $(this).text().trim(); }
                ).get(),
                    categories = _.keys(parentToChildMap).concat(['component']),
                    visitedCategories = categories.slice(0, _.indexOf(categories, category));

                expect(displayedBreadcrumbs).toEqual(
                    _.map(visitedCategories, function(cat) {
                        return cat === 'course' ?
                            'Course Outline' : cat + '_display_name_' + xblockIndex;
                    })
                );
            };

            clickForwardButton = function(buttonIndex) {
                modal.moveXBlockListView.$el.find('[data-item-index="' + buttonIndex + '"] button').click();
            };

            clickBreadcrumbButton = function() {
                moveXBlockBreadcrumbView.$el.find('.bc-container button').last().click();
            };

            nextCategory = function(direction, category) {
                return direction === 'forward' ? parentToChildMap[category] : _.invert(parentToChildMap)[category];
            };

            verifyXBlockInfo = function(options, category, buttonIndex, direction, hasCurrentLocation) {
                var expectedXBlocksCount = options[category];

                verifyListViewInfo(category, expectedXBlocksCount, hasCurrentLocation);
                verifyBreadcrumbViewInfo(category, buttonIndex);

                if (direction === 'forward') {
                    if (category === 'component') {
                        return;
                    }
                    clickForwardButton(buttonIndex);
                } else if (direction === 'backward') {
                    if (category === 'section') {
                        return;
                    }
                    clickBreadcrumbButton();
                }
                category = nextCategory(direction, category);  // eslint-disable-line no-param-reassign

                verifyXBlockInfo(options, category, buttonIndex, direction, hasCurrentLocation);
            };

            it('renders views with correct information', function() {
                var outlineOptions = {section: 1, subsection: 1, unit: 1, component: 1},
                    outline = createCourseOutline(outlineOptions);

                renderViews(outline);
                verifyXBlockInfo(outlineOptions, 'section', 0, 'forward', false);
                verifyXBlockInfo(outlineOptions, 'component', 0, 'backward', false);
            });

            it('shows correct behavior on breadcrumb navigation', function() {
                var outline = createCourseOutline({section: 1, subsection: 1, unit: 1, component: 1});

                renderViews(outline);
                _.each(_.range(3), function() {
                    clickForwardButton(0);
                });

                _.each(['component', 'unit', 'subsection', 'section'], function(category) {
                    verifyListViewInfo(category, 1);
                    if (category !== 'section') {
                        modal.moveXBlockBreadcrumbView.$el.find('.bc-container button').last().click();
                    }
                });
            });

            it('shows the correct current location', function() {
                var outlineOptions = {section: 2, subsection: 2, unit: 2, component: 2},
                    outline = createCourseOutline(outlineOptions),
                    ancestorInfo = {
                        ancestors: [
                            {
                                category: 'vertical',
                                display_name: 'unit_display_name_0',
                                id: 'unit_ID'
                            },
                            {
                                category: 'sequential',
                                display_name: 'subsection_display_name_0',
                                id: 'subsection_ID'
                            },
                            {
                                category: 'chapter',
                                display_name: 'section_display_name_0',
                                id: 'section_ID'
                            },
                            {
                                category: 'course',
                                display_name: 'Demo Course',
                                id: 'COURSE_ID_101'
                            }
                        ]
                    };

                renderViews(outline, ancestorInfo);
                verifyXBlockInfo(outlineOptions, 'section', 0, 'forward', true);
                // click the outline breadcrumb to render sections
                modal.moveXBlockBreadcrumbView.$el.find('.bc-container button').first().click();
                verifyXBlockInfo(outlineOptions, 'section', 1, 'forward', false);
            });

            it('shows correct message when parent has no childs', function() {
                var outlinesInfo = [
                    {
                        outline: createCourseOutline({}),
                        message: 'This course has no sections'
                    },
                    {
                        outline: createCourseOutline({section: 1}),
                        message: 'This section has no subsections',
                        forwardClicks: 1
                    },
                    {
                        outline: createCourseOutline({section: 1, subsection: 1}),
                        message: 'This subsection has no units',
                        forwardClicks: 2
                    },
                    {
                        outline: createCourseOutline({section: 1, subsection: 1, unit: 1}),
                        message: 'This unit has no components',
                        forwardClicks: 3
                    }
                ];

                _.each(outlinesInfo, function(info) {
                    renderViews(info.outline);
                    _.each(_.range(info.forwardClicks), function() {
                        clickForwardButton(0);
                    });
                    expect(modal.moveXBlockListView.$el.find('.xblock-no-child-message').text().trim()).toEqual(info.message);
                    modal.moveXBlockListView.undelegateEvents();
                    modal.moveXBlockBreadcrumbView.undelegateEvents();
                });
            });

            describe('Move an xblock', function(){
                var courseOutline,
                    verifyNotificationStatus,
                    isMoveEnabled,
                    selectTargetParent,
                    getConfirmationFeedbackTitle,
                    getUndoConfirmationFeedbackTitle,
                    getConfirmationFeedbackTitleHtml,
                    getConfirmationFeedbackMessageHtml,
                    sendMoveXBlockRequest,
                    moveXBlockWithSuccess;

                beforeEach(function() {
                    //var tpl = readFixtures('common/templates/components/system-feedback.underscore');
                    //setFixtures(sandbox({
                    //id: 'page-alert'
                    //}));
                    //appendSetFixtures($('<script>', {
                    //id: 'system-feedback-tpl',
                    //type: 'text/template'
                    //}).text(tpl));
                    courseOutline = createCourseOutline({section: 1, subsection: 1, unit: 1, component: 1});
                });

                afterEach(function() {
                    courseOutline = null;
                });

                isMoveEnabled = function() {
                    return !modal.$el.find('.modal-actions .action-move').hasClass('is-disabled');
                };

                selectTargetParent = function(parentLocator) {
                    modal.targetParentXBlockInfo = {
                        id: parentLocator
                    };
                };

                getConfirmationFeedbackTitle = function(displayName) {
                    return StringUtils.interpolate(
                        'Success! "{displayName}" has been moved.',
                        {
                            displayName: displayName
                        }
                    );
                };

                getUndoConfirmationFeedbackTitle = function(displayName) {
                    return StringUtils.interpolate(
                        'Move cancelled. "{sourceDisplayName}" has been moved back to its original location.',
                        {
                            sourceDisplayName: displayName
                        }
                    );
                };

                getConfirmationFeedbackTitleHtml = function(parentLocator) {
                    return StringUtils.interpolate(
                        '{link_start}Take me to the new location{link_end}',
                        {
                            link_start: HtmlUtils.HTML('<a href="/container/' + parentLocator + '">'),
                            link_end: HtmlUtils.HTML('</a>')
                        }
                    );
                };

                getConfirmationFeedbackMessageHtml = function(displayName, locator, parentLocator, sourceIndex) {
                    return HtmlUtils.interpolateHtml(
                        HtmlUtils.HTML(
                            '<a class="action-undo-move" href="#" data-source-display-name="{displayName}" ' +
                            'data-source-locator="{sourceLocator}" data-source-parent-locator="{parentSourceLocator}" ' +
                            'data-target-index="{targetIndex}">{undoMove}</a>'),
                        {
                            displayName: displayName,
                            sourceLocator: locator,
                            parentSourceLocator: parentLocator,
                            targetIndex: sourceIndex,
                            undoMove: gettext('Undo move')
                        }
                    );
                };

                verifyNotificationStatus = function(requests, notificationSpy, notificationText, sourceIndex) {
                    var sourceIndex = sourceIndex || 0;  // eslint-disable-line no-redeclare
                    ViewHelpers.verifyNotificationShowing(notificationSpy, notificationText);
                    AjaxHelpers.respondWithJson(requests, {
                        move_source_locator: sourceLocator,
                        parent_locator: sourceParentLocator,
                        target_index: sourceIndex
                    });
                    ViewHelpers.verifyNotificationHidden(notificationSpy);
                };

                sendMoveXBlockRequest = function(requests, xblockLocator, targetIndex, sourceIndex) {
                    var responseData,
                        expectedData,
                        sourceIndex = sourceIndex || 0; // eslint-disable-line no-redeclare

                    // select a target item and click
                    renderViews(courseOutline);
                    _.each(_.range(3), function() {
                        clickForwardButton(0);
                    });

                    modal.$el.find('.modal-actions .action-move').click();

                    responseData = expectedData = {
                        move_source_locator: xblockLocator,
                        parent_locator: modal.targetParentXBlockInfo.id
                    };

                    if (targetIndex !== undefined) {
                        expectedData = _.extend(expectedData, {
                            targetIndex: targetIndex
                        });
                    }

                    // verify content of request
                    AjaxHelpers.expectJsonRequest(requests, 'PATCH', '/xblock/', expectedData);

                    // send the response
                    AjaxHelpers.respondWithJson(requests, _.extend(responseData, {
                        source_index: sourceIndex
                    }));
                };

                moveXBlockWithSuccess = function(requests) {
                    var sourceIndex = 0;
                    sendMoveXBlockRequest(requests, sourceLocator);
                    expect(modal.movedAlertView).toBeDefined();
                    expect(modal.movedAlertView.options.title).toEqual(getConfirmationFeedbackTitle(sourceDisplayName));
                    expect(modal.movedAlertView.options.titleHtml).toEqual(
                        getConfirmationFeedbackTitleHtml(modal.targetParentXBlockInfo.id)
                    );
                    expect(modal.movedAlertView.options.messageHtml).toEqual(
                        getConfirmationFeedbackMessageHtml(
                            sourceDisplayName,
                            sourceLocator,
                            sourceParentLocator,
                            sourceIndex
                        )
                    );
                };

                it('move button is disabled by default', function() {
                    expect(isMoveEnabled(0)).toBeFalsy();
                });

                it('can not move is in a disabled state', function() {
                    var requests = AjaxHelpers.requests(this);
                    expect(isMoveEnabled(0)).toBeFalsy();
                    modal.$el.find('.modal-actions .action-move').click();
                    expect(modal.movedAlertView).toBeNull();
                });

                it('moves an xblock when move button is clicked', function() {
                    var requests = AjaxHelpers.requests(this);
                    moveXBlockWithSuccess(requests);
                });

                it('undo move an xblock when undo move button is clicked', function() {
                    var sourceIndex = 0,
                        requests = AjaxHelpers.requests(this);
                    moveXBlockWithSuccess(requests);
                    modal.movedAlertView.undoMoveXBlock({
                        target: $(modal.movedAlertView.options.messageHtml.text)
                    });
                    AjaxHelpers.respondWithJson(requests, {
                        move_source_locator: sourceLocator,
                        parent_locator: sourceParentLocator,
                        target_index: sourceIndex
                    });
                    expect(modal.movedAlertView.movedAlertView.options.title).toEqual(
                        getUndoConfirmationFeedbackTitle(sourceDisplayName)
                    );
                });

                it('does not move an xblock when cancel button is clicked', function() {
                    var sourceIndex = 0;
                    // select a target item and click
                    renderViews(courseOutline);
                    _.each(_.range(3), function() {
                        clickForwardButton(0);
                    });
                    modal.$el.find('.modal-actions .action-cancel').click();
                    expect(modal.movedAlertView).toBeNull();
                });

                it('shows a notification when moving', function() {
                    var requests = AjaxHelpers.requests(this),
                        notificationSpy = ViewHelpers.createNotificationSpy();
                    // select a target item and click
                    renderViews(courseOutline);
                    _.each(_.range(3), function() {
                        clickForwardButton(0);
                    });
                    modal.$el.find('.modal-actions .action-move').click();
                    verifyNotificationStatus(requests, notificationSpy, 'Moving');
                });

                it('shows a notification when undo moving', function() {
                    var notificationSpy,
                        requests = AjaxHelpers.requests(this);
                    moveXBlockWithSuccess(requests);
                    notificationSpy = ViewHelpers.createNotificationSpy();
                    modal.movedAlertView.undoMoveXBlock({
                        target: $(modal.movedAlertView.options.messageHtml.text)
                    });
                    verifyNotificationStatus(requests, notificationSpy, 'Undo moving');
                });
            });
        });
    });
