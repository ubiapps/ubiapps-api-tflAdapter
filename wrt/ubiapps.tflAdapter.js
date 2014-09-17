(function () {
  TFLAdapterModule = function (obj) {
    WebinosService.call(this,obj);
  };

  TFLAdapterModule.prototype = Object.create(WebinosService.prototype);
  TFLAdapterModule.prototype.constructor = TFLAdapterModule;

  // Register to the service discovery
  _webinos.registerServiceConstructor("http://ubiapps.com/api/tfladapter", TFLAdapterModule);

  TFLAdapterModule.prototype.bindService = function (bindCB) {
    this.getNearbyStops = getNearbyStops;
    this.getStopDetails = getStopDetails;
    this.watchStops = watchStops;
    this.clearWatch = clearWatch;

    this._watchIds = {};

    if (typeof bindCB.onBind === 'function') {
      bindCB.onBind(this);
    }
  };

  var doRPC = function(method,params,successCB,errorCB) {
    var rpc = webinos.rpcHandler.createRPC(this, method, params);
    webinos.rpcHandler.executeRPC(rpc,
      function (res) {
        if (typeof successCB !== 'undefined') {
          successCB(res);
        }
      },
      function (err) {
        if (typeof errorCB !== 'undefined') {
          errorCB(err);
        }
      }
    );
  };

  function getNearbyStops(lat, lng, dist, live, success, fail) {
    doRPC.call(this,"getNearbyStops",[lat, lng, dist, live],success,fail);
  }

  function getStopDetails(stopId, success, fail) {
    doRPC.call(this,"getStopDetails",[stopId],success,fail);
  }

  function watchStops(stopList, success, fail) {
    var rpc = webinos.rpcHandler.createRPC(this, "watchStops", stopList);
    rpc.onEvent = function(stopData) {
      success(stopData);
    };
    rpc.onError = function(err) {
      fail(err);
    };
    webinos.rpcHandler.registerCallbackObject(rpc);
    webinos.rpcHandler.executeRPC(rpc);

    var watchId = parseInt(rpc.id, 16);
    this._watchIds[watchId] = rpc.id;
    return watchId;
  };

  function clearWatch(clearWatchId) {
    if (!this._watchIds.hasOwnProperty(clearWatchId)) {
      console.log("tflCountdown clearWatch - invalid watch id: " + clearWatchId);
      return;
    }
    var watchId = this._watchIds[clearWatchId];
    var rpc = webinos.rpcHandler.createRPC(this, "clearWatch", [watchId]);
    webinos.rpcHandler.executeRPC(rpc);

    delete this._watchIds[clearWatchId];
    webinos.rpcHandler.unregisterCallbackObject( { api:watchId });
  };

}());
