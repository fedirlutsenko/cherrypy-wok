/*
 * Project Kimchi
 *
 * Copyright IBM, Corp. 2013
 *
 * Authors:
 *  Hongliang Wang <hlwang@linux.vnet.ibm.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
kimchi.main = function() {
    var DEFAULT_HASH = 'guests';

    kimchi.popable();

    /**
     * Do the following setup:
     *   1) Clear any timing events.
     *   2) Update URL hash to new page.
     *   3) Update page tabs indicator.
     */
    var onKimchiRedirect = function(url) {
        /*
         * We setup an periodly reloading of VM list, which should be removed
         * when switching to non-guest pages.
         */
        kimchi.vmTimeout && clearTimeout(kimchi.vmTimeout);

        /*
         * We use the HTML file name for hash, like: guests for guests.html,
         * templates for templates.html. Retrieve hash from the given URL and
         * update URL hash value to put an item in browsing history to make
         * pages be bookmark-able.
         */
        var hashString = url.substring(0, url.length - 5);

        if (location.hash != hashString) {
            location.hash = hashString;
        }

        /*
         * Find the corresponding tab DOM node and animate the arrow cursor to
         * point to the tab.
         */
        var tab = $('#nav-menu a[href="' + url + '"]');
        if (tab.length === 0) {
            return;
        }

        var left = $(tab).parent().position().left;
        var width = $(tab).parent().width();
        $('.menu-arrow').stop().animate({
            left : left + width / 2 - 10
        });

        // Update the visual style of tabs; focus the selected one.
        $('#nav-menu a').removeClass('current');
        $(tab).addClass('current');
        $(tab).focus();
    };

    /**
     * Use Ajax to dynamically load a page without a page refreshing. Handle
     * arrow cursor animation, DOM node focus, and page content rendering.
     */
    var loadPage = function(url) {
        if (0 === $('#nav-menu a[href="' + url + '"]').length) {
            kimchi.message.error(i18n['msg.err.uri.invalid']);
            location.hash = '';
            return;
        }

        kimchi.topic('redirect').publish(url);

        // Get the page content through Ajax and render it.
        $('#main').load(url, function(responseText, textStatus, jqXHR) {});
    };

    var updatePage = function() {
        /*
         * Update page content.
         * 1) If user types in the main page URL without hash, then we load
         *    VM list page by default, e.g., http://kimchi.company.com:8000;
         * 2) If user types a URL with hash, we load that page, e.g.,
         *    http://kimchi.company.com:8000/#template.
         */
        var hashString = (location.hash && location.hash.substr(1));

        if (!hashString) {
            location.hash = DEFAULT_HASH;
        }
        else {
            loadPage(hashString + '.html');
        }
    };

    var initListeners = function() {
        kimchi.topic('redirect').subscribe(onKimchiRedirect);

        /*
         * If hash value is changed, then we know the user is intended to load
         * another page.
         */
        window.onhashchange = function() {
            updatePage();
        };

        /*
         * Register click listener of tabs. Replace the default reloading page
         * behavior of <a> with Ajax loading.
         */
        $('#nav-menu a.item').on('click', function(event) {
            loadPage($(this).attr('href'));

            // Prevent <a> causing browser redirecting to other page.
            event.preventDefault();
        });

        $('#btn-logout').on('click', function() {
            kimchi.logout(function() {
                updatePage();
            }, function() {
                kimchi.message.error(i18n['msg.logout.failed']);
            });
        });
    };


    // Load i18n translation strings first and then render the page.
    $('#main').load('i18n.html', function() {
        $(document).bind('ajaxError', function(event, jqXHR, ajaxSettings, errorThrown) {
            if (!ajaxSettings['kimchi']) {
                return;
            }

            if (jqXHR['status'] === 401) {
                kimchi.user.showUser(false);
                kimchi.previousAjax = ajaxSettings;
                kimchi.window.open({
                    url: 'login-window.html',
                    id: 'login-window-wrapper'
                });
                return;
            }

            ajaxSettings['originalError'] && ajaxSettings['originalError'](jqXHR);
        });

        kimchi.user.showUser(true);
        initListeners();
        updatePage();
    });
};
