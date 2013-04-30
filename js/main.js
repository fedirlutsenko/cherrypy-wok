/*
 * Project Burnet
 *
 * Copyright IBM, Corp. 2013
 *
 * Authors:
 *  Anthony Liguori <aliguori@us.ibm.com>
 *
 * All Rights Reserved.
 */

function genTile(title, image, gray, small)
{
    var html = "";
    var style = "icon";

    if (gray) {
        style += " stopped";
    }

    if (small) {
        style += " small";
    }

    html += "<div class=\"" + style + "\" id=\"" + title + "\">\n";
    html += "<img src=\"" + image + "\"/>\n";
    html += "<h3>" + title + "</h3></a>\n";
    html += "</div>";

    return html;
}

function genPeer(name)
{
    return "<li class=\"project\"><a href=\"#\" title=\"titi\">titi</a></li>";
}

function load_vms(data)
{
    var sel_vms;
    var html = "";
    var i;

    sel_vms = getSelectedVMs();

    $("#vms").empty();
    for (i = 0; i < data.length; i++) {
        html += genTile(data[i].name, data[i].screenshot,
                        data[i].state != 'running', false);
    }
    $("#vms").append(html);
    selectVMs(sel_vms);

    $(".icon").click(function() {
        if (this.className.indexOf("selected") == -1) {
            this.className = this.className + " selected"
        } else {
            this.className = this.className.replace(/selected/g, "")
        }

        updateVMToolbar();
    });
}

function updateVMToolbar()
{
    selectedVMs = getSelectedVMs()
    toolbar = $(".vm-toolbar > li > a")

    if (selectedVMs.length > 1) {
        for (i = 0; i < toolbar.length; i++) {
            toolbar[i].className = toolbar[i].className + " disabled"
        }

        $(".icon-play").removeClass("disabled")
        $(".icon-off").removeClass("disabled")

        return
    }

    if (selectedVMs.length <= 1) {
        for (i = 0; i < toolbar.length; i++) {
            toolbar[i].className = toolbar[i].className.replace(/disabled/g, "")
        }
    }

    if (selectedVMs.length == 1) {
        if ($("#" + selectedVMs[0]).hasClass("stopped")) {
            $(".icon-desktop").addClass("disabled")
        }
        else {
            $(".icon-desktop").removeClass("disabled")
        }
    }
}

function load_templates(data)
{
    var html = "";
    var i;

    $("#templates").empty();
    for (i = 0; i < data.length; i++) {
        html += genTile(data[i].name, data[i].icon, false, true);
    }
    html += genTile("Create New Templates from ISOS", "images/image-missing.svg", false, true);
    html += genTile("Create New Template from Guests", "images/image-missing.svg", false, true);
    $("#templates").append(html);
}

function load_peers(data)
{
    var html = "";
    var i;

    $("ul.projects").empty();
    for (i = 0; i < data.length; i++) {
        html += genPeer(data[i]);
    }
    $("ul.projects").append(html);
}

function load(data)
{
    console.log("load");
    $.ajax({
	url: "/vms",
	dataType: "json"
    }).done(load_vms);

    $.ajax({
	url: "/templates",
	dataType: "json"
    }).done(load_templates);

    $.ajax({
    url: "/peers",
    dataType: "json",
    }).done(load_peers);

    $("div.icon").draggable({ revert: true });

    window.setTimeout("load();", 5000);
}

function getSelectedVMs()
{
    var names = []
    var vms = document.getElementById("vms");
    var selectedVMs = vms.getElementsByClassName("selected");

    for (i = 0; i < selectedVMs.length; i++) {
        names[i] = selectedVMs[i].id
    }

    return names
}

function selectVMs(names)
{
    var icons = $("#vms .icon");
    var i;

    for (i = 0; i < icons.length; i++) {
        var id = icons[i].id;
        if (names.indexOf(id) >= 0) {
            icons[i].className = icons[i].className + " selected";
        }
    }
}

function deselectIcons(names)
{
    for (i = 0; i < names.length; i++) {
        $("#" + names[i]).removeClass("selected")
    }
}

function start()
{
    var html = "";

    html = genTile("Create Guest", "images/image-missing.svg", false, true);
    $("#custom").append(html);

    load();

    $(".icon-play").click(function() {
        vms = getSelectedVMs();

        for (i = 0; i < vms.length; i++) {
            $.ajax({
                url: "/vms/" + vms[i]  + "/start",
                type: "POST",
                dataType: "json",
                context: document.getElementById(vms[i]),
            }).complete(function(context, status) {
                updateVMToolbar();

                if (status == "success") {
                    vm = $(this).context
                    vm.className = vm.className.replace(/stopped/g, "");
                } else {
                    alert ("Failed to start " + $(this).context.id);
                }
            });
        }

        deselectIcons(vms)
    });

    $(".icon-off").click(function() {
        vms = getSelectedVMs();

        for (i = 0; i < vms.length; i++) {
            $.ajax({
                url: "/vms/" + vms[i]  + "/stop",
                type: "POST",
                dataType: "json",
                context: document.getElementById(vms[i]),
            }).complete(function(context, status) {
                updateVMToolbar();

                if (status == "success") {
                    vm = $(this).context
                    vm.className = vm.className + " stopped"
                } else {
                    alert ("Failed to power off " + $(this).context.id);
                }
            });
        }

        deselectIcons(vms)
    });

    $(".icon-desktop").click(function() {
        if ($(this).hasClass("disabled")) {
            return
        }

        vm = getSelectedVMs();

        $.ajax({
            url: "/vms/" + vm[0]  + "/connect",
            type: "POST",
            dataType: "json",
        }).done(function(data, textStatus, xhr) {
            url = "/static/vnc_auto.html?port=" + data.vnc_port + "&logging=debug"
            popup = window.open(url, "", "target=_blank,height=600,width=800");
            if (popup) {
                popup.focus()
            } else {
                alert("A popup blocker may have prevented the console from displaying properly.")
            }
        });

        deselectIcons(vm)
    });

    $(".btn").button();
    $('#localLang').change(function() {
        var selection = $('#localLang option:selected').val();
        document.cookie = 'burnetLang' + "=" + selection;
        window.location.reload()
    });
}

$(document).ready(function(){ start(); });
