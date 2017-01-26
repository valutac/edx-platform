define(['jquery', 'underscore', 'edx-ui-toolkit/js/utils/spec-helpers/ajax-helpers',
        'common/js/spec_helpers/template_helpers', 'js/views/modals/move_xblock_modal', 'js/models/xblock_info'],
    function($, _, AjaxHelpers, TemplateHelpers, MoveXBlockModal, XBlockInfo) {
        'use strict';
        describe('MoveXBlockModal', function() {
            var modal,
                showModal,
                DISPLAY_NAME = 'HTML 101',
                OUTLINE_URL = '/course/cid?formats=concise',
                ANCESTORS_URL = '/xblock/USAGE_ID?fields=ancestorInfo';

            showModal = function() {
                modal = new MoveXBlockModal({
                    sourceXBlockInfo: new XBlockInfo({
                        id: 'USAGE_ID',
                        display_name: DISPLAY_NAME,
                        category: 'html'
                    }),
                    XBlockUrlRoot: '/xblock',
                    outlineURL: OUTLINE_URL,
                    XBlockAncestorInfoUrl: ANCESTORS_URL

                });
                modal.show();
            };

            beforeEach(function() {
                TemplateHelpers.installTemplates([
                    'basic-modal',
                    'modal-button',
                    'move-xblock-modal'
                ]);
            });

            afterEach(function() {
                modal.hide();
            });

            it('rendered as expected', function() {
                showModal();
                expect(modal.$el.find('.modal-header .title').text()).toEqual('Move: ' + DISPLAY_NAME);
                expect(modal.$el.find('.modal-actions .action-primary.action-move').text()).toEqual('Move');
            });

            it('sends request to fetch course outline', function() {
                var requests = AjaxHelpers.requests(this),
                    renderViewsSpy;
                showModal();
                renderViewsSpy = spyOn(modal, 'renderViews');
                expect(requests.length).toEqual(2);
                AjaxHelpers.expectRequest(requests, 'GET', OUTLINE_URL);
                AjaxHelpers.respondWithJson(requests, {});
                AjaxHelpers.expectRequest(requests, 'GET', ANCESTORS_URL);
                AjaxHelpers.respondWithJson(requests, {});
                expect(renderViewsSpy).toHaveBeenCalled();
            });
        });
    });
