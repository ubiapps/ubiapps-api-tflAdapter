(function () {
  var RPCWebinosService = require('webinos-jsonrpc2').RPCWebinosService;
  var TFLAdapterImpl = require("./tflAdapter_impl");

  var TFLAdapterModule = function (rpcHandler, params) {
    this.rpcHandler = rpcHandler;
    this.params = params;
    this.internalRegistry = {};
  };

  TFLAdapterModule.prototype.init = function (register, unregister) {
    this.register = register;
    this.unregister = unregister;
  };

  TFLAdapterModule.prototype.updateServiceParams = function (serviceId, params) {
    var self = this,
      id;

    if (serviceId && self.internalRegistry[serviceId]) {
      self.unregister({"id":serviceId, "api": self.internalRegistry[serviceId].api} );
      delete self.internalRegistry[serviceId];
    }

    if (params) {
      var service = new TFLAdapterService(this.rpcHandler, params);
      id = this.register(service);
      this.internalRegistry[id] = service;
    }

    return id;
  };

  var TFLAdapterService = function (rpcHandler, params) {
    // inherit from RPCWebinosService
    this.base = RPCWebinosService;
    this.base({
      api: 'http://ubiapps.com/api/tfladapter',
      displayName: "TFL Bus Times",
      description: "TFL Bus Countdown Information"
    });

    this.rpcHandler = rpcHandler;
    this._impl = new TFLAdapterImpl(params, rpcHandler);
  };

  TFLAdapterService.prototype = new RPCWebinosService;

  TFLAdapterService.prototype.getNearbyStops = function (params, successCB, errorCB) {
    return this._impl.getNearbyStops(params[0],params[1],params[2],params[3],successCB, errorCB);
  };

  TFLAdapterService.prototype.getRoute = function (params, successCB, errorCB) {

  };

  TFLAdapterService.prototype.getStopDetails = function (params, successCB, errorCB) {
    return this._impl.getStopDetails(params[0], successCB, errorCB);
  };

  TFLAdapterService.prototype.watchStops = function(args, successCB, errorCB, objectRef) {
    return this._impl.watchStops(args, successCB, errorCB, objectRef);
  };

  TFLAdapterService.prototype.clearWatch = function(params, successCB, errorCB, objectRef) {
    return this._impl.clearWatch(params[0], successCB, errorCB, objectRef);
  };

  // export our object
  exports.Module = TFLAdapterModule;
})();
