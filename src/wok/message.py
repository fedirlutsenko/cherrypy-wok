#
# Project Wok
#
# Copyright IBM Corp, 2016
#
# Code derived from Project Kimchi
#
# This library is free software; you can redistribute it and/or
# modify it under the terms of the GNU Lesser General Public
# License as published by the Free Software Foundation; either
# version 2.1 of the License, or (at your option) any later version.
#
# This library is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public
# License along with this library; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301 USA

import cherrypy
import gettext

from wok.template import get_lang, validate_language


class WokMessage(object):
    def __init__(self, code='', args={}, plugin=None):
        # make all args unicode
        for key, value in args.iteritems():
            if isinstance(value, unicode):
                continue

            try:
                # In case the value formats itself to an ascii string.
                args[key] = unicode(str(value), 'utf-8')
            except UnicodeEncodeError:
                # In case the value is a WokException or it formats
                # itself to a unicode string.
                args[key] = unicode(value)

        self.code = code
        self.args = args
        self.plugin = plugin

    def _get_translation(self):
        wok_app = cherrypy.tree.apps['']

        # get app from plugin path if specified
        if self.plugin:
            app = cherrypy.tree.apps[self.plugin]
        # if on request, try to get app from it
        elif cherrypy.request.app:
            app = cherrypy.request.app
        # fallback: get root app (WokRoot)
        else:
            app = wok_app

        # fallback to Wok message in case plugins raise Wok exceptions
        text = app.root.messages.get(self.code, None)
        if text is None:
            app = wok_app
            text = app.root.messages.get(self.code, self.code)

        # do translation
        domain = app.root.domain
        paths = app.root.paths
        lang = validate_language(get_lang())

        try:
            translation = gettext.translation(domain, paths.mo_dir, [lang])
        except:
            translation = gettext

        return translation.gettext(text)

    def get_text(self):
        msg = self._get_translation()
        msg = unicode(msg, 'utf-8') % self.args
        return "%s: %s" % (self.code, msg)
