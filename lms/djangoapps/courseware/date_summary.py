"""
This module provides date summary blocks for the Course Info
page. Each block gives information about a particular
course-run-specific date which will be displayed to the user.
"""
import datetime

from babel.dates import format_timedelta
from django.core.urlresolvers import reverse
from django.utils.functional import cached_property
from django.utils.translation import get_language, to_locale, ugettext_lazy
from django.utils.translation import ugettext as _
from lazy import lazy
from pytz import timezone, utc

from course_modes.models import CourseMode
from lms.djangoapps.commerce.utils import EcommerceService
from lms.djangoapps.verify_student.models import SoftwareSecurePhotoVerification, VerificationDeadline
from openedx.core.djangoapps.certificates.api import can_show_certificate_available_date_field
from student.models import CourseEnrollment


class DateSummary(object):
    """Base class for all date summary blocks."""

    @property
    def css_class(self):
        """
        The CSS class of this summary. Indicates the type of information
        this summary block contains, and its urgency.
        """
        return ''

    @property
    def title(self):
        """The title of this summary."""
        return ''

    @property
    def description(self):
        """The detail text displayed by this summary."""
        return ''

    @property
    def date(self):
        """This summary's date."""
        return None

    @property
    def date_format(self):
        """
        The format to display this date in. By default, displays like Jan
        01, 2015.
        """
        return u'%b %d, %Y'

    @property
    def link(self):
        """The location to link to for more information."""
        return ''

    @property
    def link_text(self):
        """The text of the link."""
        return ''

    @property
    def time_zone(self):
        """
        The time zone in which to display -- defaults to UTC
        """
        return timezone(
            self.user.preferences.model.get_value(self.user, "time_zone", "UTC")
        )

    def __init__(self, course, user, course_id=None):
        self.course = course
        self.user = user
        self.course_id = course_id or self.course.id

    @property
    def relative_datestring(self):
        """
        Return this block's date in a human-readable format. If the date
        is None, returns the empty string.
        """
        if self.date is None:
            return ''
        locale = to_locale(get_language())
        delta = self.date - datetime.datetime.now(utc)
        try:
            relative_date = format_timedelta(delta, locale=locale)
        # Babel doesn't have translations for Esperanto, so we get
        # a KeyError when testing translations with
        # ?preview-lang=eo. This should not happen with any other
        # languages. See https://github.com/python-babel/babel/issues/107
        except KeyError:
            relative_date = format_timedelta(delta)
        date_has_passed = delta.days < 0
        # Translators: 'absolute' is a date such as "Jan 01,
        # 2020". 'relative' is a fuzzy description of the time until
        # 'absolute'. For example, 'absolute' might be "Jan 01, 2020",
        # and if today were December 5th, 2020, 'relative' would be "1
        # month".
        date_format = _(u"{relative} ago - {absolute}") if date_has_passed else _(u"in {relative} - {absolute}")
        return date_format.format(
            relative=relative_date,
            absolute='{date}',
        )

    @property
    def is_enabled(self):
        """
        Whether or not this summary block should be shown.

        By default, the summary is only shown if its date is in the
        future.
        """
        if self.date is not None:
            return datetime.datetime.now(utc).date() <= self.date.date()
        return False

    def deadline_has_passed(self):
        """
        Return True if a deadline (the date) exists, and has already passed.
        Returns False otherwise.
        """
        deadline = self.date
        return deadline is not None and deadline <= datetime.datetime.now(utc)

    def __repr__(self):
        return u'DateSummary: "{title}" {date} is_enabled={is_enabled}'.format(
            title=self.title,
            date=self.date,
            is_enabled=self.is_enabled
        )


class TodaysDate(DateSummary):
    """
    Displays today's date.
    """
    css_class = 'todays-date'
    is_enabled = True

    # The date is shown in the title, no need to display it again.
    def get_context(self):
        context = super(TodaysDate, self).get_context()
        context['date'] = ''
        return context

    @property
    def date(self):
        return datetime.datetime.now(utc)

    @property
    def title(self):
        return 'current_datetime'


class CourseStartDate(DateSummary):
    """
    Displays the start date of the course.
    """
    css_class = 'start-date'
    title = ugettext_lazy('Course Starts')

    @property
    def date(self):
        return self.course.start


class CourseEndDate(DateSummary):
    """
    Displays the end date of the course.
    """
    css_class = 'end-date'
    title = ugettext_lazy('Course End')

    @property
    def is_enabled(self):
        return self.date is not None

    @property
    def description(self):
        if datetime.datetime.now(utc) <= self.date:
            mode, is_active = CourseEnrollment.enrollment_mode_for_user(self.user, self.course_id)
            if is_active and CourseMode.is_eligible_for_certificate(mode):
                return _('To earn a certificate, you must complete all requirements before this date.')
            else:
                return _('After this date, course content will be archived.')
        return _('This course is archived, which means you can review course content but it is no longer active.')

    @property
    def date(self):
        return self.course.end


class CertificateAvailableDate(DateSummary):
    """
    Displays the certificate available date of the course.
    """
    css_class = 'certificate-available-date'
    title = ugettext_lazy('Certificate Available')

    @property
    def active_certificates(self):
        return [
            certificate for certificate in self.course.certificates.get('certificates', [])
            if certificate.get('is_active', False)
        ]

    @property
    def is_enabled(self):
        return (
            can_show_certificate_available_date_field(self.course) and
            self.has_certificate_modes and
            self.date is not None and
            datetime.datetime.now(utc) <= self.date and
            len(self.active_certificates) > 0
        )

    @property
    def description(self):
        return _('Day certificates will become available for passing verified learners.')

    @property
    def date(self):
        return self.course.certificate_available_date

    @property
    def has_certificate_modes(self):
        return any([
            mode.slug for mode in CourseMode.modes_for_course(
                course_id=self.course.id, include_expired=True
            ) if mode.slug != CourseMode.AUDIT
        ])


class VerifiedUpgradeDeadlineDate(DateSummary):
    """
    Displays the date before which learners must upgrade to the
    Verified track.
    """
    css_class = 'verified-upgrade-deadline'
    title = ugettext_lazy('Verification Upgrade Deadline')
    description = ugettext_lazy(
        'You are still eligible to upgrade to a Verified Certificate! '
        'Pursue it to highlight the knowledge and skills you gain in this course.'
    )
    link_text = ugettext_lazy('Upgrade to Verified Certificate')

    @property
    def link(self):
        ecommerce_service = EcommerceService()
        if ecommerce_service.is_enabled(self.user):
            course_mode = CourseMode.objects.get(
                course_id=self.course_id, mode_slug=CourseMode.VERIFIED
            )
            return ecommerce_service.get_checkout_page_url(course_mode.sku)
        return reverse('verify_student_upgrade_and_verify', args=(self.course_id,))

    @cached_property
    def enrollment(self):
        return CourseEnrollment.get_enrollment(self.user, self.course_id)

    @property
    def is_enabled(self):
        """
        Whether or not this summary block should be shown.

        By default, the summary is only shown if it has date and the date is in the
        future and the user's enrollment is in upsell modes
        """
        is_enabled = super(VerifiedUpgradeDeadlineDate, self).is_enabled
        if not is_enabled:
            return False

        enrollment_mode = None
        is_active = None

        if self.enrollment:
            enrollment_mode = self.enrollment.mode
            is_active = self.enrollment.is_active

        # Return `true` if user is not enrolled in course
        if enrollment_mode is None and is_active is None:
            return True

        # Show the summary if user enrollment is in which allow user to upsell
        return is_active and enrollment_mode in CourseMode.UPSELL_TO_VERIFIED_MODES

    @lazy
    def date(self):
        deadline = None

        if self.enrollment:
            deadline = self.enrollment.upgrade_deadline

        return deadline


class VerificationDeadlineDate(DateSummary):
    """
    Displays the date by which the user must complete the verification
    process.
    """

    @property
    def css_class(self):
        base_state = 'verification-deadline'
        if self.deadline_has_passed():
            return base_state + '-passed'
        elif self.must_retry():
            return base_state + '-retry'
        else:
            return base_state + '-upcoming'

    @property
    def link_text(self):
        return self.link_table[self.css_class][0]

    @property
    def link(self):
        return self.link_table[self.css_class][1]

    @property
    def link_table(self):
        """Maps verification state to a tuple of link text and location."""
        return {
            'verification-deadline-passed': (_('Learn More'), ''),
            'verification-deadline-retry': (_('Retry Verification'), reverse('verify_student_reverify')),
            'verification-deadline-upcoming': (
                _('Verify My Identity'),
                reverse('verify_student_verify_now', args=(self.course_id,))
            )
        }

    @property
    def title(self):
        if self.deadline_has_passed():
            return _('Missed Verification Deadline')
        return _('Verification Deadline')

    @property
    def description(self):
        if self.deadline_has_passed():
            return _(
                "Unfortunately you missed this course's deadline for"
                " a successful verification."
            )
        return _(
            "You must successfully complete verification before"
            " this date to qualify for a Verified Certificate."
        )

    @lazy
    def date(self):
        return VerificationDeadline.deadline_for_course(self.course_id)

    @lazy
    def is_enabled(self):
        if self.date is None:
            return False
        (mode, is_active) = CourseEnrollment.enrollment_mode_for_user(self.user, self.course_id)
        if is_active and mode == 'verified':
            return self.verification_status in ('expired', 'none', 'must_reverify')
        return False

    @lazy
    def verification_status(self):
        """Return the verification status for this user."""
        return SoftwareSecurePhotoVerification.user_status(self.user)[0]

    def must_retry(self):
        """Return True if the user must re-submit verification, False otherwise."""
        return self.verification_status == 'must_reverify'
