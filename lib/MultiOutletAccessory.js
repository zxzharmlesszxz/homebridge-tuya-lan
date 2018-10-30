const BaseAccessory = require('./BaseAccessory');
const async = require('async');

class MultiOutletAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.OUTLET;
    }

    constructor(...props) {
        super(...props);
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        const outletCount = parseInt(this.device.context.outletCount) ||1;
        for (let i = 0; i++ < outletCount;) {
            this.accessory.addService(Service.Outlet, this.device.context.name + ' ' + i, 'outlet ' + i);
        }

        super._registerPlatformAccessory();
    }

    _addEventHandlers(dps) {
        const {Service, Characteristic} = this.hap;

        const characteristics = {};
        this.accessory.services.forEach(service => {
            if (service.UUID !== Service.Outlet.UUID || !service.subtype) return false;

            let match;
            if ((match = service.subtype.match(/^outlet (\d+)$/)) === null) return;

            characteristics[match[1]] = service.getCharacteristic(Characteristic.On)
                .updateValue(dps[match[1]])
                .on('get', this.getPower.bind(this, match[1]))
                .on('set', this.setPower.bind(this, match[1]));
        });

        this.device.on('change', (changes, state) => {
            Object.keys(changes).forEach(key => {
                if (characteristics[key] && characteristics[key].value !== changes[key]) characteristics[key].updateValue(changes[key]);
            });
        });
    }

    getPower(dp, callback) {
        callback(null, this.device.state[dp]);
    }

    setPower(dp, value, callback) {
        if (!this._pendingPower) {
            this._pendingPower = {props: {}, callbacks: []};
        }

        if (dp) {
            if (this._pendingPower.timer) clearTimeout(this._pendingPower.timer);

            this._pendingPower.props = {...this._pendingPower.props, ...{[dp]: value}};
            this._pendingPower.callbacks.push(callback);

            this._pendingPower.timer = setTimeout(() => {
                this.setPower();
            }, 500);
            return;
        }

        const callbacks = this._pendingPower.callbacks;
        const callEachBack = err => {
            async.eachSeries(callbacks, (callback, next) => {
                try {
                    callback(err);
                } catch (ex) {}
                next();
            });
        };

        const newValue = this._pendingPower.props;
        this._pendingPower = null;

        this.setMultiState(newValue, callEachBack);
    }
}

module.exports = MultiOutletAccessory;