"""
This module contains various configuration settings via
waffle switches for the contentstore app.
"""
from openedx.core.djangoapps.waffle_utils import WaffleFlagNamespace, WaffleSwitchNamespace

# Namespace
WAFFLE_NAMESPACE = u'studio'

# Switches
ENABLE_ACCESSIBILITY_POLICY_PAGE = u'enable_policy_page'


def waffle():
    """
    Returns the namespaced, cached, audited Waffle Switch class for Studio pages.
    """
    return WaffleSwitchNamespace(name=WAFFLE_NAMESPACE, log_prefix=u'Studio: ')


def waffle_flags():
    """
    Returns the namespaced, cached, audited Waffle Flag class for Studio pages.
    """
    return WaffleFlagNamespace(name=WAFFLE_NAMESPACE, log_prefix=u'Studio: ')
