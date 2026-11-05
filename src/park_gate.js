'use strict';
// No demo fallback or user override. Time comes from a monotonic clock.
class ParkGate {
    constructor(clock, options) {
        this.clock = clock || (() => { const t=process.hrtime();return t[0]*1000+t[1]/1e6; });
        this.maxAge = (options && options.maxAgeMs) || 2500;
        this.settle = options && options.settleMs !== undefined ? options.settleMs : 3000;
        this.speed = null;this.gear = null;this.speedAt = null;this.gearAt = null;
        this.since = null;this.visible = false;this.onBlock = null;this.wasAllowed = false;
    }
    setVisible(visible) { this.visible=visible===true;return this.check(); }
    updateSpeed(raw) {
        this.speed = Number.isInteger(raw) && raw >= 0 && raw < 65535 ? raw/64 : null;
        this.speedAt=this.clock();return this.check();
    }
    updateGear(raw) {
        // VehicleInformation.statusGearboxDrive.statusActualStageDrive: P = 1.
        this.gear = raw === 'P' || raw === 1 ? 'P' : null;
        this.gearAt=this.clock();return this.check();
    }
    unavailable() { this.speed=null;this.gear=null;this.since=null;return this.check(); }
    reason() {
        const now=this.clock();
        if (!this.visible) return 'Browser nicht im Vordergrund';
        if (this.speed === null || this.gear === null) return 'Stillstand und P noch nicht bestätigt';
        // Speed has a getter and is refreshed. This firmware's gear field is
        // notify-only; its last event remains current while the provider is
        // available. The caller invalidates BOTH fields on provider loss.
        if (now-this.speedAt < 0 || now-this.speedAt > this.maxAge) return 'Fahrzeugsignale nicht aktuell';
        if (this.speed > 0.05 || this.gear !== 'P') return 'Nur im Stand und in P';
        return null;
    }
    check() {
        const now=this.clock(),why=this.reason();
        if (why) this.since=null;
        else if (this.since === null) this.since=now;
        const allowed=!why && now-this.since >= this.settle;
        const block=this.wasAllowed&&!allowed;this.wasAllowed=allowed;
        if (block && this.onBlock) this.onBlock(why || 'Stand wird bestätigt');
        return {allowed,reason:why || (allowed ? null : 'Stand wird bestätigt')};
    }
}
module.exports=ParkGate;
