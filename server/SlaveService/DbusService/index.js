/* eslint-disable no-console */
import DBus from 'dbus';
import { promisify } from 'util';
import _ from 'lodash';

const DBUS_SERVICE_NAME = 'org.freedesktop.DBus';
const DBUS_INTERFACE_NAME = 'org.freedesktop.DBus';
const DBUS_OBJECT_PATH = '/org/freedesktop/DBus';
const NAME_OWNER_CHANGED_NAME = 'NameOwnerChanged';
const OBJECT_MANAGER_INTERFACE_NAME = `${DBUS_SERVICE_NAME}.ObjectManager`;
const PROPERTIES_INTERFACE_NAME = `${DBUS_SERVICE_NAME}.Properties`;
const OBJECT_PATH = '/';

const SERVICE_NAME = 'br.org.cesar.modbus';
const SLAVE_INTERFACE_NAME = `${SERVICE_NAME}.Slave1`;
const SOURCE_INTERFACE_NAME = `${SERVICE_NAME}.Source1`;
const MANAGER_INTERFACE_NAME = `${SERVICE_NAME}.Manager1`;

const INVALID_ARGUMENTS = `${SERVICE_NAME}.InvalidArgs`;

function setKeysToLowerCase(obj) {
  return _.mapKeys(obj, (v, k) => k.toLowerCase());
}

function mapObjectsByIface(objects, iface) {
  return _.chain(objects)
    .pickBy(object => _.has(object, iface))
    .map(object => setKeysToLowerCase(object[iface]))
    .value();
}

function mapObjectsToIdPath(objects) {
  return _.chain(objects)
    .pickBy(object => _.has(object, SLAVE_INTERFACE_NAME))
    .mapValues(iface => _.get(iface[SLAVE_INTERFACE_NAME], 'Id'))
    .invert()
    .value();
}

function mapObjectsToSources(objects, idPathMap, id) {
  const slaveId = _.pickBy(objects, (value, key) => _.startsWith(key, idPathMap[id]));
  const pathSources = _.pickBy(slaveId, value => _.has(value, SOURCE_INTERFACE_NAME));
  return _.chain(pathSources)
    .mapValues((object, path) => { object[SOURCE_INTERFACE_NAME].path = path; return object; })
    .map(object => setKeysToLowerCase(object[SOURCE_INTERFACE_NAME]))
    .value();
}

function mapInterfaceToSlave(iface) {
  return mapObjectsByIface([iface], SLAVE_INTERFACE_NAME)[0];
}

function mapInterfaceToSource(iface) {
  return mapObjectsByIface([iface], SOURCE_INTERFACE_NAME)[0];
}

function throwDbusUnavailable() {
  const err = new Error('DBus service is unavailable');
  err.code = 503;
  throw err;
}

function throwSlaveNotFound(id) {
  const err = new Error(`Not found slave ${id}`);
  err.code = 404;
  throw err;
}

function parseDbusError(err) {
  let code;
  const dbusError = new Error(err.message);
  switch (err.dbusName) {
    case INVALID_ARGUMENTS:
      code = 400;
      break;
    default:
      code = 500;
      break;
  }
  dbusError.code = code;
  return dbusError;
}

class DbusServices {
  constructor(config) {
    process.env.DISPLAY = ':0';
    if (config.address) {
      process.env.DBUS_SYSTEM_BUS_ADDRESS = config.address;
    }
    this.bus = DBus.getBus('system');
    this.getInterface = promisify(this.bus.getInterface.bind(this.bus));
    this.slaves = [];
    this.idPathMap = {};
    this.idSourcesMap = {};
    this.started = false;
  }

  async loadSlaves() {
    const iface = await this.getInterface(SERVICE_NAME, OBJECT_PATH, OBJECT_MANAGER_INTERFACE_NAME);
    const getManagedObjects = promisify(iface.GetManagedObjects.bind(iface));
    const objects = await getManagedObjects();
    this.slaves = await mapObjectsByIface(objects, SLAVE_INTERFACE_NAME);
    this.idPathMap = await mapObjectsToIdPath(objects);
    this.slaves.forEach((slave) => {
      const sources = mapObjectsToSources(objects, this.idPathMap, slave.id);
      this.idSourcesMap[slave.id] = sources;
    });
  }

  removeSlave(path) {
    const id = Number(_.findKey(this.idPathMap, value => value === path));
    if (id) {
      console.log('Slave removed:', id);
      delete this.idPathMap[id];
      _.remove(this.slaves, slave => slave.id === id);
      if (this.removedCb) {
        this.removedCb(id);
      }
    }
  }

  addSlave(slave, path) {
    if (_.has(this.idPathMap, slave.id)) {
      // Remove old device with same id
      this.removeSlave(this.idPathMap[slave.id]);
    }
    this.idPathMap[slave.id] = path;
    this.slaves = _.concat(this.slaves, slave);
  }

  removeSource(path) {
    const slave = _.find(this.slaves, slv => _.startsWith(path, this.idPathMap[slv.id]));
    if (slave) {
      const sources = this.idSourcesMap[slave.id];
      _.remove(sources, src => src.path === path);
    }
  }

  addSource(source, slaveId) {
    const sources = this.idSourcesMap[slaveId];
    if (_.find(sources, src => source.address === src.address)) {
      // Remove old source with same id
      this.removeSource(source, slaveId);
    }
    sources.push(source);
  }

  async monitorSlaveProperties(slave, objPath) {
    const iface = await this.getInterface(SERVICE_NAME, objPath, PROPERTIES_INTERFACE_NAME);
    iface.on('PropertiesChanged', (changedInterface, properties) => {
      if (changedInterface === SLAVE_INTERFACE_NAME) {
        const changedProperties = setKeysToLowerCase(properties);
        console.log(`Changes to slave ${slave.id}: ${JSON.stringify(changedProperties)}`);
        _.merge(slave, changedProperties);
        if (this.updatedCb) {
          this.updatedCb(slave.id, changedProperties);
        }
      }
    });
    console.log(`Monitoring slave ${slave.id} properties`);
  }

  async monitorSourceProperties(slave, objPath) {
    const iface = await this.getInterface(SERVICE_NAME, objPath, PROPERTIES_INTERFACE_NAME);
    iface.on('PropertiesChanged', (changedInterface, properties) => {
      if (changedInterface === SOURCE_INTERFACE_NAME) {
        const changedProperties = setKeysToLowerCase(properties);
        const sources = this.idSourcesMap[slave.id];
        const source = _.find(sources, src => src.path === objPath);
        console.log(`Changes to source ${source.address}: ${JSON.stringify(changedProperties)}`);
        _.merge(source, changedProperties);
        if (this.sourceUpdateCb) {
          this.sourceUpdateCb(slave.id, source.address, changedProperties);
        }
      }
    });
    console.log(`Monitoring source properties in path ${objPath}`);
  }

  async startSlaveMonitoring() {
    const iface = await this.getInterface(SERVICE_NAME, OBJECT_PATH, OBJECT_MANAGER_INTERFACE_NAME);
    this.ifaceMonitored = iface;
    await this.loadSlaves();
    this.slaves.forEach((slave) => {
      const sources = this.idSourcesMap[slave.id];
      this.monitorSlaveProperties(slave, this.idPathMap[slave.id]);
      sources.forEach(source => this.monitorSourceProperties(slave, source.path));
    });

    iface.on('InterfacesAdded', async (objPath, addedInterface) => {
      const slave = mapInterfaceToSlave(addedInterface);
      // The slave can be undefined if the interface added is not DEVICE_INTERFACE
      if (slave) {
        console.log('Slave added:', slave);
        this.addSlave(slave, objPath);
        await this.monitorSlaveProperties(slave, objPath);
        if (this.addedCb) {
          this.addedCb(slave);
        }
      } else {
        const slaveId = _.findKey(this.idPathMap, path => _.startsWith(objPath, path));
        const source = mapInterfaceToSource(addedInterface);

        if (source) {
          source.path = objPath;
          this.addSource(source, slaveId);
        }
      }
    });
    iface.on('InterfacesRemoved', (objPath) => {
      this.removeSlave(objPath);
      this.removeSource(objPath);
    });

    console.log('Monitoring slaves being added and removed');
    this.started = true;
  }

  async stopSlaveMonitoring() {
    this.ifaceMonitored.removeAllListeners();
    this.slaves = [];
    this.idPathMap = {};
    this.started = false;
  }

  execute() {
    this.getInterface(DBUS_SERVICE_NAME, DBUS_OBJECT_PATH, DBUS_INTERFACE_NAME)
      .then(async (iface) => {
        console.log('Watching slave service initialization');
        iface.on(NAME_OWNER_CHANGED_NAME, async (name, oldOwner, newOwner) => {
          if (name !== SERVICE_NAME) {
            return;
          }

          if (!oldOwner) {
            console.log('Slave service is up');
            this.startSlaveMonitoring();
          } else if (!newOwner) {
            console.log('Slave service is down');
            this.stopSlaveMonitoring();
          }
        });

        this.startSlaveMonitoring()
          .catch((err) => {
            console.error(err);
            throw parseDbusError(err);
          });
      })
      .catch((err) => {
        console.error(err);
        throw parseDbusError(err);
      });
  }

  list() {
    if (!this.started) {
      throwDbusUnavailable();
    }
    return this.slaves;
  }

  get(id) {
    const slave = _.find(this.slaves, { id });
    if (!slave) {
      throwSlaveNotFound(id);
    }
    return slave;
  }

  async add(id, name, url) {
    if (!this.started) {
      throwDbusUnavailable();
    }

    if (this.slaves.some(slv => slv.id === id)) {
      const err = new Error(`Slave ${id} already exists`);
      err.code = 409;
      throw err;
    }
    const slave = { Id: id, Name: name, URL: url };
    try {
      const iface = await this.getInterface(SERVICE_NAME, OBJECT_PATH, MANAGER_INTERFACE_NAME);
      await iface.AddSlave(slave);
    } catch (err) {
      console.log(err);
            throw parseDbusError(err);
          }
  }

  async remove(id) {
    if (!this.started) {
      throwDbusUnavailable();
    }

    if (!this.slaves.some(slv => slv.id === id)) {
      throwSlaveNotFound(id);
    }
    const path = this.idPathMap[id];
    try {
      const iface = await this.getInterface(SERVICE_NAME, OBJECT_PATH, MANAGER_INTERFACE_NAME);
      await iface.RemoveSlave(path);
    } catch (err) {
      console.log(err);
      throw parseDbusError(err);
    }
  }

  listSources(id) {
    return this.idSourcesMap[id];
  }
}

export default DbusServices;
