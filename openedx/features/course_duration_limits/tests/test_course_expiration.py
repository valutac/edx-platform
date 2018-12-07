"""
Contains tests to verify correctness of course expiration functionality
"""
import json
from datetime import timedelta

from django.conf import settings
from django.urls import reverse
from django.utils.timezone import now
import ddt
import mock

from course_modes.models import CourseMode
from experiments.models import ExperimentData
from openedx.core.djangoapps.content.course_overviews.models import CourseOverview
from openedx.features.content_type_gating.partitions import CONTENT_GATING_PARTITION_ID, CONTENT_TYPE_GATE_GROUP_IDS
from openedx.features.course_duration_limits.access import get_user_course_expiration_date, MIN_DURATION, MAX_DURATION
from openedx.features.course_duration_limits.config import EXPERIMENT_ID, EXPERIMENT_DATA_HOLDBACK_KEY
from openedx.features.course_experience.tests.views.helpers import add_course_mode
from openedx.features.course_duration_limits.models import CourseDurationLimitConfig
from student.models import CourseEnrollment
from student.roles import CourseInstructorRole
from student.tests.factories import UserFactory, CourseEnrollmentFactory
from xmodule.partitions.partitions import ENROLLMENT_TRACK_PARTITION_ID
from xmodule.modulestore.tests.django_utils import ModuleStoreTestCase
from xmodule.modulestore.tests.factories import CourseFactory


@ddt.ddt
class CourseExpirationTestCase(ModuleStoreTestCase):
    """Tests to verify the get_user_course_expiration_date function is working correctly"""
    def setUp(self):
        super(CourseExpirationTestCase, self).setUp()
        self.course = CourseFactory(
            start=now() - timedelta(weeks=10),
        )
        self.user = UserFactory()

        # Make this a verified course so we can test expiration date
        add_course_mode(self.course, upgrade_deadline_expired=False)

    def tearDown(self):
        CourseEnrollment.unenroll(self.user, self.course.id)
        super(CourseExpirationTestCase, self).tearDown()

    def test_enrollment_mode(self):
        """Tests that verified enrollments do not have an expiration"""
        CourseEnrollment.enroll(self.user, self.course.id, CourseMode.VERIFIED)
        result = get_user_course_expiration_date(self.user, self.course)
        self.assertEqual(result, None)

    @mock.patch("openedx.features.course_duration_limits.access.get_course_run_details")
    @ddt.data(
        [int(MIN_DURATION.days / 7) - 1, MIN_DURATION, False],
        [7, timedelta(weeks=7), False],
        [int(MAX_DURATION.days / 7) + 1, MAX_DURATION, False],
        [None, MIN_DURATION, False],
        [int(MIN_DURATION.days / 7) - 1, MIN_DURATION, True],
        [7, timedelta(weeks=7), True],
        [int(MAX_DURATION.days / 7) + 1, MAX_DURATION, True],
        [None, MIN_DURATION, True],
    )
    @ddt.unpack
    def test_all_courses_with_weeks_to_complete(
        self,
        weeks_to_complete,
        access_duration,
        self_paced,
        mock_get_course_run_details,
    ):
        """
        Test that access_duration for a course is equal to the value of the weeks_to_complete field in discovery.
        If weeks_to_complete is None, access_duration will be the MIN_DURATION constant.

        """
        if self_paced:
            self.course.self_paced = True
        mock_get_course_run_details.return_value = {'weeks_to_complete': weeks_to_complete}
        enrollment = CourseEnrollment.enroll(self.user, self.course.id, CourseMode.AUDIT)
        result = get_user_course_expiration_date(self.user, self.course)
        self.assertEqual(result, enrollment.created + access_duration)

    @mock.patch("openedx.features.course_duration_limits.access.get_course_run_details")
    def test_content_availability_date(self, mock_get_course_run_details):
        """
        Content availability date is course start date or enrollment date, whichever is later.
        """
        access_duration = timedelta(weeks=7)
        mock_get_course_run_details.return_value = {'weeks_to_complete': 7}

        # Content availability date is enrollment date
        start_date = now() - timedelta(weeks=10)
        past_course = CourseFactory(start=start_date)
        enrollment = CourseEnrollment.enroll(self.user, past_course.id, CourseMode.AUDIT)
        result = get_user_course_expiration_date(self.user, past_course)
        self.assertEqual(result, None)

        add_course_mode(past_course, upgrade_deadline_expired=False)
        result = get_user_course_expiration_date(self.user, past_course)
        content_availability_date = enrollment.created
        self.assertEqual(result, content_availability_date + access_duration)

        # Content availability date is course start date
        start_date = now() + timedelta(weeks=10)
        future_course = CourseFactory(start=start_date)
        enrollment = CourseEnrollment.enroll(self.user, future_course.id, CourseMode.AUDIT)
        result = get_user_course_expiration_date(self.user, future_course)
        self.assertEqual(result, None)

        add_course_mode(future_course, upgrade_deadline_expired=False)
        result = get_user_course_expiration_date(self.user, future_course)
        content_availability_date = start_date
        self.assertEqual(result, content_availability_date + access_duration)

    @mock.patch("openedx.features.course_duration_limits.access.get_course_run_details")
    @ddt.data(
        ({'user_partition_id': CONTENT_GATING_PARTITION_ID,
          'group_id': CONTENT_TYPE_GATE_GROUP_IDS['limited_access']}, True),
        ({'user_partition_id': CONTENT_GATING_PARTITION_ID,
          'group_id': CONTENT_TYPE_GATE_GROUP_IDS['full_access']}, False),
        ({'user_partition_id': ENROLLMENT_TRACK_PARTITION_ID,
          'group_id': settings.COURSE_ENROLLMENT_MODES['audit']['id']}, True),
        ({'user_partition_id': ENROLLMENT_TRACK_PARTITION_ID,
          'group_id': settings.COURSE_ENROLLMENT_MODES['verified']['id']}, False),
        ({'role': 'staff'}, False),
        ({'role': 'student'}, True),
        ({'username': 'audit'}, True),
        ({'username': 'verified'}, False),
    )
    @ddt.unpack
    def test_masquerade(self, masquerade_config, show_expiration_banner, mock_get_course_run_details):
        mock_get_course_run_details.return_value = {'weeks_to_complete': 12}
        audit_student = UserFactory(username='audit')
        CourseEnrollmentFactory.create(
            user=audit_student,
            course_id=self.course.id,
            mode='audit'
        )
        verified_student = UserFactory(username='verified')
        CourseEnrollmentFactory.create(
            user=verified_student,
            course_id=self.course.id,
            mode='verified'
        )
        CourseDurationLimitConfig.objects.create(
            enabled=True,
            course=CourseOverview.get_from_id(self.course.id),
            enabled_as_of=self.course.start,
        )

        instructor = UserFactory.create(username='instructor')
        CourseEnrollmentFactory.create(
            user=instructor,
            course_id=self.course.id,
            mode='audit'
        )
        CourseInstructorRole(self.course.id).add_users(instructor)
        self.client.login(username=instructor.username, password='test')

        self.update_masquerade(**masquerade_config)

        course_home_url = reverse('openedx.course_experience.course_home', args=[unicode(self.course.id)])
        response = self.client.get(course_home_url, follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertItemsEqual(response.redirect_chain, [])
        banner_text = 'Your access to this course expires on'
        if show_expiration_banner:
            self.assertIn(banner_text, response.content)
        else:
            self.assertNotIn(banner_text, response.content)

    def update_masquerade(self, role='student', group_id=None, username=None, user_partition_id=None):
        """
        Toggle masquerade state.
        """
        masquerade_url = reverse(
            'masquerade_update',
            kwargs={
                'course_key_string': unicode(self.course.id),
            }
        )
        response = self.client.post(
            masquerade_url,
            json.dumps({
                'role': role,
                'group_id': group_id,
                'user_name': username,
                'user_partition_id': user_partition_id,
            }),
            'application/json'
        )
        self.assertEqual(response.status_code, 200)
        return response

    @mock.patch("openedx.features.course_duration_limits.access.get_course_run_details")
    def test_masquerade_in_holdback(self, mock_get_course_run_details):
        mock_get_course_run_details.return_value = {'weeks_to_complete': 12}
        audit_student = UserFactory(username='audit')
        CourseEnrollmentFactory.create(
            user=audit_student,
            course_id=self.course.id,
            mode='audit'
        )
        ExperimentData.objects.create(
            user=audit_student,
            experiment_id=EXPERIMENT_ID,
            key=EXPERIMENT_DATA_HOLDBACK_KEY.format(audit_student),
            value='True'
        )
        CourseDurationLimitConfig.objects.create(
            enabled=True,
            course=CourseOverview.get_from_id(self.course.id),
            enabled_as_of=self.course.start,
        )

        instructor = UserFactory.create(username='instructor')
        CourseEnrollmentFactory.create(
            user=instructor,
            course_id=self.course.id,
            mode='audit'
        )
        CourseInstructorRole(self.course.id).add_users(instructor)
        self.client.login(username=instructor.username, password='test')

        self.update_masquerade(username='audit')

        course_home_url = reverse('openedx.course_experience.course_home', args=[unicode(self.course.id)])
        response = self.client.get(course_home_url, follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertItemsEqual(response.redirect_chain, [])
        banner_text = 'Your access to this course expires on'
        self.assertNotIn(banner_text, response.content)

    @mock.patch("openedx.features.course_duration_limits.access.get_course_run_details")
    def test_masquerade_expired(self, mock_get_course_run_details):
        mock_get_course_run_details.return_value = {'weeks_to_complete': 1}

        audit_student = UserFactory(username='audit')
        enrollment = CourseEnrollmentFactory.create(
            user=audit_student,
            course_id=self.course.id,
            mode='audit',
        )
        enrollment.created = self.course.start
        enrollment.save()
        CourseDurationLimitConfig.objects.create(
            enabled=True,
            course=CourseOverview.get_from_id(self.course.id),
            enabled_as_of=self.course.start,
        )

        instructor = UserFactory.create(username='instructor')
        CourseEnrollmentFactory.create(
            user=instructor,
            course_id=self.course.id,
            mode='audit'
        )
        CourseInstructorRole(self.course.id).add_users(instructor)
        self.client.login(username=instructor.username, password='test')

        self.update_masquerade(username='audit')

        course_home_url = reverse('openedx.course_experience.course_home', args=[unicode(self.course.id)])
        response = self.client.get(course_home_url, follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertItemsEqual(response.redirect_chain, [])
        banner_text = 'This learner would not have access to this course. Their access expired on'
        self.assertIn(banner_text, response.content)
