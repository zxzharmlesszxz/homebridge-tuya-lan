const BaseAccessory = require('./BaseAccessory');

const STATE_OTHER = 9;

class ThermostatAccessory extends BaseAccessory {
    static getCategory(Categories) {
        return Categories.THERMOSTAT;
    }

    constructor(...props) {
        super(...props);

        this.mode = 'Low';
        this.lock = false;
        this.cmdHeat = 'HEAT';
        if (this.device.context.cmdHeat) {
            if (/^h[a-z]+$/i.test(this.device.context.cmdHeat)) this.cmdHeat = ('' + this.device.context.cmdHeat).trim();
            else throw new Error('The cmdHeat doesn\'t appear to be valid: ' + this.device.context.cmdHeat);
        }
    }

    _registerPlatformAccessory() {
        const {Service} = this.hap;

        this.accessory.addService(Service.HeaterCooler, this.device.context.name);

        super._registerPlatformAccessory();
    }

    _registerCharacteristics(dps) {
        const {Service, Characteristic} = this.hap;
        const service = this.accessory.getService(Service.HeaterCooler);

        const characteristicActive = service.getCharacteristic(Characteristic.Active)
            .updateValue(this._getActive(dps['7']))
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        const characteristicCurrentHeaterCoolerState = service.getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .updateValue(this._getCurrentHeaterCoolerState(dps))
            .on('get', this.getCurrentHeaterCoolerState.bind(this));

        const _validTargetHeaterCoolerStateValues = [STATE_OTHER];
        if (!this.device.context.noHeat) _validTargetHeaterCoolerStateValues.unshift(Characteristic.TargetHeaterCoolerState.HEAT);

        const characteristicTargetHeaterCoolerState = service.getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .setProps({
                maxValue: 9,
                validValues: _validTargetHeaterCoolerStateValues
            })
            .updateValue(this._getTargetHeaterCoolerState(dps['4']))
            .on('get', this.getTargetHeaterCoolerState.bind(this))
            .on('set', this.setTargetHeaterCoolerState.bind(this));

        const characteristicCurrentTemperature = service.getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(dps['3'])
            .on('get', this.getState.bind(this, '3'));

        let characteristicHeatingThresholdTemperature;
        if (!this.device.context.noHeat) {
            characteristicHeatingThresholdTemperature = service.getCharacteristic(Characteristic.HeatingThresholdTemperature)
                .setProps({
                    minValue: this.device.context.minTemperature || 10,
                    maxValue: this.device.context.maxTemperature || 35,
                    minStep: this.device.context.minTemperatureSteps || 1
                })
                .updateValue(dps['2'])
                .on('get', this.getState.bind(this, '2'))
                .on('set', this.setTargetThresholdTemperature.bind(this, 'heat'));
        }

        const characteristicTemperatureDisplayUnits = service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .updateValue(this._getTemperatureDisplayUnits(dps['19']))
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        this.characteristicHeatingThresholdTemperature = characteristicHeatingThresholdTemperature;

        this.device.on('change', (changes, state) => {
            if (changes.hasOwnProperty('7')) {
                const newActive = this._getActive(changes['7']);
                if (characteristicActive.value !== newActive) {
                    characteristicActive.updateValue(changes['7']);
                }
            }

            if (changes.hasOwnProperty('2')) {
                if (!this.device.context.noHeat && characteristicHeatingThresholdTemperature && characteristicHeatingThresholdTemperature.value !== changes['2'])
                    characteristicHeatingThresholdTemperature.updateValue(changes['2']);
            }

            if (changes.hasOwnProperty('3') && characteristicCurrentTemperature.value !== changes['3']) characteristicCurrentTemperature.updateValue(changes['3']);

            if (changes.hasOwnProperty('4')) {
                const newTargetHeaterCoolerState = this._getTargetHeaterCoolerState(changes['4']);
                const newCurrentHeaterCoolerState = this._getCurrentHeaterCoolerState(state);
                if (characteristicTargetHeaterCoolerState.value !== newTargetHeaterCoolerState) characteristicTargetHeaterCoolerState.updateValue(newTargetHeaterCoolerState);
                if (characteristicCurrentHeaterCoolerState.value !== newCurrentHeaterCoolerState) characteristicCurrentHeaterCoolerState.updateValue(newCurrentHeaterCoolerState);
            }

            if (changes.hasOwnProperty('19')) {
                const newTemperatureDisplayUnits = this._getTemperatureDisplayUnits(changes['19']);
                if (characteristicTemperatureDisplayUnits.value !== newTemperatureDisplayUnits) characteristicTemperatureDisplayUnits.updateValue(newTemperatureDisplayUnits);
            }
        });
    }

    getActive(callback) {
        this.getState('7', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getActive(dp));
        });
    }

    _getActive(dp) {
        const {Characteristic} = this.hap;

        return dp ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
    }

    setActive(value, callback) {
        const {Characteristic} = this.hap;

        switch (value) {
            case Characteristic.Active.ACTIVE:
                return this.setState('7', true, callback);

            case Characteristic.Active.INACTIVE:
                return this.setState('7', false, callback);
        }

        callback();
    }

    getCurrentHeaterCoolerState(callback) {
        this.getState(['7', '4'], (err, dps) => {
            if (err) return callback(err);

            callback(null, this._getCurrentHeaterCoolerState(dps));
        });
    }

    _getCurrentHeaterCoolerState(dps) {
        const {Characteristic} = this.hap;
        if (!dps['7']) return Characteristic.CurrentHeaterCoolerState.INACTIVE;

        switch (dps['4']) {
            case this.cmdHeat:
                return Characteristic.CurrentHeaterCoolerState.HEATING;

            default:
                return Characteristic.CurrentHeaterCoolerState.IDLE;
        }
    }

    getTargetHeaterCoolerState(callback) {
        this.getState('4', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTargetHeaterCoolerState(dp));
        });
    }

    _getTargetHeaterCoolerState(dp) {
        const {Characteristic} = this.hap;

        switch (dp) {
            default:
            case this.cmdHeat:
                return Characteristic.TargetHeaterCoolerState.HEAT;
        }
    }

    setTargetHeaterCoolerState(value, callback) {
        const {Characteristic} = this.hap;

        switch (value) {
            case Characteristic.TargetHeaterCoolerState.HEAT:
                return this.setState('4', this.cmdHeat, callback);
        }

        callback();
    }

    setTargetThresholdTemperature(mode, value, callback) {
        this.setState('2', value, err => {
            if (err) return callback(err);
            this.characteristicHeatingThresholdTemperature.updateValue(value);

            callback();
        });
    }

    getTemperatureDisplayUnits(callback) {
        this.getState('19', (err, dp) => {
            if (err) return callback(err);

            callback(null, this._getTemperatureDisplayUnits(dp));
        });
    }

    _getTemperatureDisplayUnits(dp) {
        const {Characteristic} = this.hap;

        return dp === 'F' ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS;
    }

    setTemperatureDisplayUnits(value, callback) {
        const {Characteristic} = this.hap;

        this.setState('19', value === Characteristic.TemperatureDisplayUnits.FAHRENHEIT ? 'F' : 'C', callback);
    }

}

module.exports = ThermostatAccessory;
