define(['jquery', 'underscore', 'edx-ui-toolkit/js/utils/spec-helpers/ajax-helpers',
        'common/js/spec_helpers/template_helpers', 'js/views/move_xblock_list',
        'js/views/move_xblock_breadcrumb', 'js/models/xblock_info'],
    function($, _, AjaxHelpers, TemplateHelpers, MoveXBlockListView, MoveXBlockBreadcrumbView,
             XBlockInfoModel) {
        'use strict';
        describe('MoveXBlock', function() {
            var renderViews, createXBlockInfo, createCourseOutline, moveXBlockBreadcrumbView,
                moveXBlockListView, parentToChildMap, categoryMap, verifyInfo, createChildXBlockInfo,
                verifyBreadcrumbViewInfo, verifyListViewInfo, getDisplayedInfo, clickForwardButton, clickBackButton,
                verifyXBlockInfo;

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
                setFixtures(
                    "<div class='breadcrumb-container'></div><div class='xblock-list-container'></div>"
                );
                TemplateHelpers.installTemplates([
                    'move-xblock-list',
                    'move-xblock-breadcrumb'
                ]);
            });

            afterEach(function() {
                moveXBlockBreadcrumbView.remove();
                moveXBlockListView.remove();
            });

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
                moveXBlockBreadcrumbView = new MoveXBlockBreadcrumbView({});
                moveXBlockListView = new MoveXBlockListView(
                    {
                        model: new XBlockInfoModel(courseOutlineJson, {parse: true}),
                        ancestorInfo: ancestorInfo || {ancestors: []}
                    }
                );
            };

            getDisplayedInfo = function() {
                var viewEl = moveXBlockListView.$el;
                return {
                    categoryText: viewEl.find('.category-text').text().trim(),
                    currentLocationText: viewEl.find('.current-location').text().trim(),
                    xblockCount: viewEl.find('.xblock-item').length,
                    xblockDisplayNames: viewEl.find('.xblock-item .button-displayname').map(
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
                expect(displayedInfo.categoryText).toEqual(moveXBlockListView.categoriesText[category] + ':');
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
                var displayedBreadcrumbs = moveXBlockBreadcrumbView.$el.find('.breadcrumbs .bc-container').map(
                    function() { return $(this).text().trim(); }
                ).get(),
                    categories = _.keys(parentToChildMap).concat(['component']),
                    visitedCategories = categories.slice(0, _.indexOf(categories, category));

                if (category === 'section') {
                    expect($('.button-backward').is(':disabled')).toBeTruthy();
                } else {
                    expect($('.button-backward').is(':disabled')).toBeFalsy();
                }

                expect(displayedBreadcrumbs).toEqual(
                    _.map(visitedCategories, function(cat) {
                        return cat === 'course' ?
                            'Course Outline' : cat + '_display_name_' + xblockIndex;
                    })
                );
            };

            clickForwardButton = function(buttonIndex) {
                moveXBlockListView.$el.find('[data-item-index="' + buttonIndex + '"] button').click();
            };

            clickBackButton = function() {
                moveXBlockBreadcrumbView.$el.find('.button-backward').click();
            };

            verifyXBlockInfo = function(options, category, buttonIndex, direction, hasCurrentLocation) {
                var expectedXBlocksCount = options[category],
                    newCategory;

                verifyListViewInfo(category, expectedXBlocksCount, hasCurrentLocation);
                verifyBreadcrumbViewInfo(category, buttonIndex);

                if (direction === 'forward') {
                    if (category === 'component') {
                        return;
                    }
                    clickForwardButton(buttonIndex);
                    newCategory = parentToChildMap[category];
                } else if (direction === 'backward') {
                    if (category === 'section') {
                        return;
                    }
                    clickBackButton();
                    newCategory = _.invert(parentToChildMap)[category];
                }

                verifyXBlockInfo(options, newCategory, buttonIndex, direction, hasCurrentLocation);
            };

            verifyInfo = function(options) {
                _.each(_.range(options.section), function(item, index) {
                    verifyXBlockInfo(options, 'section', index, 'forward', false);
                    verifyXBlockInfo(options, 'component', index, 'backward', false);
                });
            };

            it('renders views with correct information', function() {
                var outlineOptions = {
                        section: 2,
                        subsection: 2,
                        unit: 2,
                        component: 2
                    },
                    outline = createCourseOutline(outlineOptions);

                renderViews(outline);
                verifyInfo(outlineOptions, 'section');
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
                        moveXBlockBreadcrumbView.$el.find('.bc-container button').last().click();
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
                moveXBlockBreadcrumbView.$el.find('.bc-container button').first().click();
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
                    expect(moveXBlockListView.$el.find('.xblock-no-child-message').text().trim()).toEqual(info.message);
                    moveXBlockListView.undelegateEvents();
                    moveXBlockBreadcrumbView.undelegateEvents();
                });
            });
        });
    });
