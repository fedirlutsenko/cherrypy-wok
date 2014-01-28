#
# Project Kimchi
#
# Copyright IBM, Corp. 2013
#
# Authors:
#  Aline Manera <alinefm@linux.vnet.ibm.com>
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

import libvirt

from kimchi import xmlutils
from kimchi.scan import Scanner
from kimchi.exception import InvalidOperation, MissingParameter
from kimchi.exception import NotFoundError, OperationFailed
from kimchi.model_.libvirtstoragepool import StoragePoolDef
from kimchi.utils import add_task, kimchi_log


ISO_POOL_NAME = u'kimchi_isos'
POOL_STATE_MAP = {0: 'inactive',
                  1: 'initializing',
                  2: 'active',
                  3: 'degraded',
                  4: 'inaccessible'}

STORAGE_SOURCES = {'netfs': {'addr': '/pool/source/host/@name',
                             'path': '/pool/source/dir/@path'}}


class StoragePoolsModel(object):
    def __init__(self, **kargs):
        self.conn = kargs['conn']
        self.objstore = kargs['objstore']
        self.scanner = Scanner(self._clean_scan)
        self.scanner.delete()

    def get_list(self):
        try:
            conn = self.conn.get()
            names = conn.listStoragePools()
            names += conn.listDefinedStoragePools()
            return sorted(names)
        except libvirt.libvirtError as e:
            raise OperationFailed(e.get_error_message())

    def create(self, params):
        task_id = None
        conn = self.conn.get()
        try:
            name = params['name']
            if name in (ISO_POOL_NAME, ):
                raise InvalidOperation("StoragePool already exists")

            if params['type'] == 'kimchi-iso':
                task_id = self._do_deep_scan(params)
            poolDef = StoragePoolDef.create(params)
            poolDef.prepare(conn)
            xml = poolDef.xml
        except KeyError, key:
            raise MissingParameter(key)

        if name in self.get_list():
            err = "The name %s has been used by a pool"
            raise InvalidOperation(err % name)

        try:
            if task_id:
                # Create transient pool for deep scan
                conn.storagePoolCreateXML(xml, 0)
                return name

            pool = conn.storagePoolDefineXML(xml, 0)
            if params['type'] in ['logical', 'dir', 'netfs']:
                pool.build(libvirt.VIR_STORAGE_POOL_BUILD_NEW)
                # autostart dir and logical storage pool created from kimchi
                pool.setAutostart(1)
            else:
                # disable autostart for others
                pool.setAutostart(0)
        except libvirt.libvirtError as e:
            msg = "Problem creating Storage Pool: %s"
            kimchi_log.error(msg, e)
            raise OperationFailed(e.get_error_message())
        return name

    def _clean_scan(self, pool_name):
        try:
            conn = self.conn.get()
            pool = conn.storagePoolLookupByName(pool_name)
            pool.destroy()
            with self.objstore as session:
                session.delete('scanning', pool_name)
        except Exception, e:
            err = "Exception %s occured when cleaning scan result"
            kimchi_log.debug(err % e.message)

    def _do_deep_scan(self, params):
        scan_params = dict(ignore_list=[])
        scan_params['scan_path'] = params['path']
        params['type'] = 'dir'

        for pool in self.get_list():
            try:
                res = self.storagepool_lookup(pool)
                if res['state'] == 'active':
                    scan_params['ignore_list'].append(res['path'])
            except Exception, e:
                err = "Exception %s occured when get ignore path"
                kimchi_log.debug(err % e.message)

        params['path'] = self.scanner.scan_dir_prepare(params['name'])
        scan_params['pool_path'] = params['path']
        task_id = add_task('', self.scanner.start_scan, self.objstore,
                           scan_params)
        # Record scanning-task/storagepool mapping for future querying
        with self.objstore as session:
                session.store('scanning', params['name'], task_id)
        return task_id


class StoragePoolModel(object):
    def __init__(self, **kargs):
        self.conn = kargs['conn']
        self.objstore = kargs['objstore']

    @staticmethod
    def get_storagepool(name, conn):
        conn = conn.get()
        try:
            return conn.storagePoolLookupByName(name)
        except libvirt.libvirtError as e:
            if e.get_error_code() == libvirt.VIR_ERR_NO_STORAGE_POOL:
                raise NotFoundError("Storage Pool '%s' not found" % name)
            else:
                raise

    def _get_storagepool_vols_num(self, pool):
        try:
            if pool.isActive():
                pool.refresh(0)
                return pool.numOfVolumes()
            else:
                return 0
        except libvirt.libvirtError as e:
            raise OperationFailed(e.get_error_message())

    def _get_storage_source(self, pool_type, pool_xml):
        source = {}
        if pool_type not in STORAGE_SOURCES:
            return source

        for key, val in STORAGE_SOURCES[pool_type].items():
            res = xmlutils.xpath_get_text(pool_xml, val)
            source[key] = res[0] if len(res) == 1 else res

        return source

    def lookup(self, name):
        pool = self.get_storagepool(name, self.conn)
        info = pool.info()
        nr_volumes = self._get_storagepool_vols_num(pool)
        autostart = True if pool.autostart() else False
        xml = pool.XMLDesc(0)
        path = xmlutils.xpath_get_text(xml, "/pool/target/path")[0]
        pool_type = xmlutils.xpath_get_text(xml, "/pool/@type")[0]
        source = self._get_storage_source(pool_type, xml)
        res = {'state': POOL_STATE_MAP[info[0]],
               'path': path,
               'source': source,
               'type': pool_type,
               'autostart': autostart,
               'capacity': info[1],
               'allocated': info[2],
               'available': info[3],
               'nr_volumes': nr_volumes}

        if not pool.isPersistent():
            # Deal with deep scan generated pool
            try:
                with self.objstore as session:
                    task_id = session.get('scanning', name)
                res['task_id'] = str(task_id)
                res['type'] = 'kimchi-iso'
            except NotFoundError:
                # User created normal pool
                pass
        return res

    def update(self, name, params):
        autostart = params['autostart']
        if autostart not in [True, False]:
            raise InvalidOperation("Autostart flag must be true or false")
        pool = self.get_storagepool(name, self.conn)
        if autostart:
            pool.setAutostart(1)
        else:
            pool.setAutostart(0)
        ident = pool.name()
        return ident

    def activate(self, name):
        pool = self.get_storagepool(name, self.conn)
        try:
            pool.create(0)
        except libvirt.libvirtError as e:
            raise OperationFailed(e.get_error_message())

    def deactivate(self, name):
        pool = self.get_storagepool(name, self.conn)
        try:
            pool.destroy()
        except libvirt.libvirtError as e:
            raise OperationFailed(e.get_error_message())

    def delete(self, name):
        pool = self.get_storagepool(name, self.conn)
        if pool.isActive():
            err = "Unable to delete the active storagepool %s"
            raise InvalidOperation(err % name)
        try:
            pool.undefine()
        except libvirt.libvirtError as e:
            raise OperationFailed(e.get_error_message())


class IsoPoolModel(object):
    def __init__(self, **kargs):
        pass

    def lookup(self, name):
        return {'state': 'active',
                'type': 'kimchi-iso'}
