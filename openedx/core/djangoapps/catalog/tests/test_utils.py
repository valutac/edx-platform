"""Tests covering utilities for integrating with the catalog service."""
import uuid
import copy

from django.test import TestCase
import mock
from opaque_keys.edx.keys import CourseKey

from openedx.core.djangoapps.catalog.models import CatalogIntegration
from openedx.core.djangoapps.catalog.tests.factories import ProgramFactory, ProgramTypeFactory
from openedx.core.djangoapps.catalog.tests.mixins import CatalogIntegrationMixin
from openedx.core.djangoapps.catalog.utils import get_programs, get_program_types, get_programs_with_type_logo
from student.tests.factories import UserFactory, AnonymousUserFactory

UTILS_MODULE = 'openedx.core.djangoapps.catalog.utils'


@mock.patch(UTILS_MODULE + '.get_edx_api_data')
class TestGetPrograms(CatalogIntegrationMixin, TestCase):
    """Tests covering retrieval of programs from the catalog service."""
    def setUp(self):
        super(TestGetPrograms, self).setUp()

        self.user = UserFactory()
        self.uuid = str(uuid.uuid4())
        self.type = 'FooBar'
        self.catalog_integration = self.create_catalog_integration(cache_ttl=1)

    def assert_contract(self, call_args, program_uuid=None, type=None):  # pylint: disable=redefined-builtin
        """Verify that API data retrieval utility is used correctly."""
        args, kwargs = call_args

        for arg in (self.catalog_integration, self.user, 'programs'):
            self.assertIn(arg, args)

        self.assertEqual(kwargs['resource_id'], program_uuid)

        cache_key = '{base}.programs{type}'.format(
            base=self.catalog_integration.CACHE_KEY,
            type='.' + type if type else ''
        )
        self.assertEqual(
            kwargs['cache_key'],
            cache_key if self.catalog_integration.is_cache_enabled else None
        )

        self.assertEqual(kwargs['api']._store['base_url'], self.catalog_integration.internal_api_url)  # pylint: disable=protected-access

        querystring = {
            'marketable': 1,
            'exclude_utm': 1,
        }
        if type:
            querystring['type'] = type
        self.assertEqual(kwargs['querystring'], querystring)

        return args, kwargs

    def test_get_programs(self, mock_get_catalog_data):
        programs = [ProgramFactory() for __ in range(3)]
        mock_get_catalog_data.return_value = programs

        data = get_programs(self.user)

        self.assert_contract(mock_get_catalog_data.call_args)
        self.assertEqual(data, programs)

    def test_get_programs_anonymous_user(self, mock_get_catalog_data):
        programs = [ProgramFactory() for __ in range(3)]
        mock_get_catalog_data.return_value = programs

        anonymous_user = AnonymousUserFactory()

        # The user is an Anonymous user but the Catalog Service User has not been created yet.
        data = get_programs(anonymous_user)
        # This should not return programs.
        self.assertEqual(data, [])

        UserFactory(username='lms_catalog_service_user')
        # After creating the service user above,
        data = get_programs(anonymous_user)
        # the programs should be returned successfully.
        self.assertEqual(data, programs)

    def test_get_one_program(self, mock_get_catalog_data):
        program = ProgramFactory()
        mock_get_catalog_data.return_value = program

        data = get_programs(self.user, uuid=self.uuid)

        self.assert_contract(mock_get_catalog_data.call_args, program_uuid=self.uuid)
        self.assertEqual(data, program)

    def test_get_programs_by_type(self, mock_get_catalog_data):
        programs = [ProgramFactory() for __ in range(2)]
        mock_get_catalog_data.return_value = programs

        data = get_programs(self.user, type=self.type)

        self.assert_contract(mock_get_catalog_data.call_args, type=self.type)
        self.assertEqual(data, programs)

    def test_programs_unavailable(self, mock_get_catalog_data):
        mock_get_catalog_data.return_value = []

        data = get_programs(self.user)

        self.assert_contract(mock_get_catalog_data.call_args)
        self.assertEqual(data, [])

    def test_cache_disabled(self, mock_get_catalog_data):
        self.catalog_integration = self.create_catalog_integration(cache_ttl=0)
        get_programs(self.user)
        self.assert_contract(mock_get_catalog_data.call_args)

    def test_config_missing(self, _mock_get_catalog_data):
        """Verify that no errors occur if this method is called when catalog config is missing."""
        CatalogIntegration.objects.all().delete()

        data = get_programs(self.user)
        self.assertEqual(data, [])


@mock.patch(UTILS_MODULE + '.get_edx_api_data')
class TestGetProgramTypes(CatalogIntegrationMixin, TestCase):
    """Tests covering retrieval of program types from the catalog service."""
    def test_get_program_types(self, mock_get_edx_api_data):
        program_types = [ProgramTypeFactory() for __ in range(3)]
        mock_get_edx_api_data.return_value = program_types

        # Catalog integration is disabled.
        data = get_program_types()
        self.assertEqual(data, [])

        self.create_catalog_integration()
        UserFactory(username='lms_catalog_service_user')
        data = get_program_types()
        self.assertEqual(data, program_types)

    def test_get_programs_with_type_logo(self, _mock_get_edx_api_data):
        programs = []
        program_types = []
        programs_with_type_logo = []

        for index in range(3):
            # Creating the Programs and their corresponding program types.
            type_name = 'type_name_{postfix}'.format(postfix=index)
            program = ProgramFactory(type=type_name)
            program_type = ProgramTypeFactory(name=type_name)

            programs.append(program)
            program_types.append(program_type)

            program_with_type_logo = copy.deepcopy(program)
            program_with_type_logo['logo_image'] = program_type['logo_image']
            programs_with_type_logo.append(program_with_type_logo)

        with mock.patch('openedx.core.djangoapps.catalog.utils.get_programs') as patched_get_programs:
            with mock.patch('openedx.core.djangoapps.catalog.utils.get_program_types') as patched_get_program_types:
                patched_get_programs.return_value = programs
                patched_get_program_types.return_value = program_types

                actual = get_programs_with_type_logo()
                self.assertEqual(actual, programs_with_type_logo)
