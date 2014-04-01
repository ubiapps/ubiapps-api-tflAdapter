(function() {
  var http = require("http");

  function TFLCountdownImpl(cfg, rpcHandler) {
    this._config = cfg;
    this._watchList = {};
    this._tickInterval = 30000;
    this._rpcHandler = rpcHandler;

    // Start polling for TFL updates.
    nextTick.call(this);
  }

  // TFL responses are not valid JSON - currently they are \r\n delimited arrays.
  var parseTFLResponse = function(resp) {
    // ToDo - fix this hack.
    // Convert new-lines to commas and wrap in top-level array to form valid JSON.
    var jsonResp = "[" + resp.replace(/\r\n/g,",") + "]";
    console.log(jsonResp);
    return JSON.parse(jsonResp);
  };

  // Issue HTTP request to given TFL endpoint.
  var getJSONRequest = function(endpoint, successCB, errorCB) {
    http.get(endpoint, function(res) {
      var chunks = [];
      res.on('data', function(chunk) {
        chunks.push(chunk);
      }).on('end', function() {
          var body = Buffer.concat(chunks).toString();
          try {
            var jsonBody = parseTFLResponse(body);
            successCB(jsonBody);
          } catch (e) {
            errorCB(e);
          }
        });
    }).on("error", errorCB);
  };

  // Get reference (i.e. non-live) data for bus stops within a given radius of the specified position.
  TFLCountdownImpl.prototype.getNearbyStops = function(lat, lng, radius, live, successCB, errorCB) {
    var circleEndpoint = this._config.apiURL + "?Circle=" + lat + "," + lng + "," + radius + "&StopPointState=0&ReturnList=StopCode1,Latitude,Longitude,StopPointName";
    if (typeof live !== "undefined" && live === true) {
      circleEndpoint += ",LineID,EstimatedTime";
    }
    console.log("TFL endpoint: " + circleEndpoint);
    getJSONRequest(circleEndpoint, successCB, errorCB);
  };

  // Get reference and live data for a particular bus stop.
  TFLCountdownImpl.prototype.getStopDetails = function(stopId, succesCB, errorCB) {
    var stopEndpoint = this._config.apiURL + "?StopPointState=0&ReturnList=StopCode1,Latitude,Longitude,StopPointName,LineID,EstimatedTime&Circle=" + lat + "," + lng + "," + radius;
    console.log("TFL endpoint: " + stopEndpoint);
    getJSONRequest(stopEndpoint, successCB, errorCB);
  };

  // Register to receive live updates for all stops in the given array.
  TFLCountdownImpl.prototype.watchStops = function(busStopList, successCB, errorCB, objectRef) {
    addStopWatchList.call(this, busStopList, objectRef);
  };

  // Clear watch listener.
  TFLCountdownImpl.prototype.clearWatch = function(watchId, successCB, errorCB) {
    removeWatchList.call(this,watchId);
    process.nextTick(successCB);
  };

  var nextTick = function() {
    var self = this;
    setTimeout(TFLTickHandler.bind(self),self._tickInterval);
  };

  // Periodically request updates for all stops that have listeners attached.
  var TFLTickHandler = function() {
    var self = this;

    // Build comma-separated list of stops which have listeners attached.
    var stopList = "";
    for (var stp in this._watchList) {
      if (this._watchList.hasOwnProperty(stp)) {
        stopList += stp + ",";
      }
    }

    if (stopList.length > 0) {
      // Success callback.
      var TFLSuccess = function(resp) {
        TFLResponseHandler.call(self,resp);
        nextTick.call(self);
      };

      // Failed callback.
      var TFLError = function(err) {
        console.log("TFLTickHandler - failed to get TFL data for endpoint " + stopEndpoint + " - " + err.message);
        nextTick.call(self);
      };

      // Create endpoint to receive live data for all stops in the list.
      var stopEndpoint = this._config.apiURL + "?returnlist=StopCode1,StopPointName,LineID,EstimatedTime&stopcode1=" + stopList;
      console.log("TFL endpoint is: " + stopEndpoint);

      // Issue request to TFL API.
      getJSONRequest(stopEndpoint, TFLSuccess, TFLError);
    } else {
      // Do nothing and schedule next tick.
      console.log("TFLTickHandler - nothing to do...");
      nextTick.call(self);
    }
  };

  var TFLResponseHandler = function(resp) {
    var self = this;
    //
    // TFL response is array of arrays.
    // First array is version info and server timestamp.
    //
    // [4,"1.0",1396104503441]
    // [1,"Swan Lane","47337","263",1396104941000]
    // [1,"Swan Lane","47337","125",1396104750000]
    // ...
    //
    var TFLServerTime = resp[0][2];
    var broadcastData = {};

    for (var i = 1, len = resp.length; i < len; i++) {
      // Extract update data.
      var update = {
        name: resp[i][1],
        busStopId: resp[i][2],
        line: resp[i][3],
        time: resp[i][4] - TFLServerTime
      };

      // Are there any listeners for this bus stop?
      if (this._watchList.hasOwnProperty(update.busStopId)) {
        // For each rpc client listening for changes to this bus stop...
        for (var rpcId in this._watchList[update.busStopId]) {
          // Add an entry to the broadcast cache for this client.
          if (!broadcastData.hasOwnProperty(rpcId)) {
            broadcastData[rpcId] = {
              ref: this._watchList[update.busStopId][rpcId],
              updates: {}
            };
          }
          // There are likely to be many updates per bus stop - add each to update array.
          if (!broadcastData[rpcId].updates.hasOwnProperty(update.busStopId)) {
            broadcastData[rpcId].updates[update.busStopId] = [];
          }
          broadcastData[rpcId].updates[update.busStopId].push(update);
        }
      }
    }

    // Now notify each client of their updates.
    var droppedClients = [];
    for (var client in broadcastData) {
      if (broadcastData.hasOwnProperty(client)) {
        var objectRef = broadcastData[client].ref;
        var rpc = this._rpcHandler.createRPC(objectRef, 'onEvent', broadcastData[client].updates);
        if (false === this._rpcHandler.executeRPC(rpc)) {
          droppedClients.push(client);
        }
      }
    }

    droppedClients.forEach(function(rpcId) {
      removeWatchList.call(self, rpcId);
    });
  };

  // Register an rpc client for updates to the given bus stop.
  var addStopWatch = function(busStopId, objectRef) {
    if (!this._watchList.hasOwnProperty(busStopId)) {
      this._watchList[busStopId] = {};
    }
    if (!this._watchList[busStopId].hasOwnProperty(objectRef.rpcId)) {
      this._watchList[busStopId][objectRef.rpcId] = objectRef;
    }
  };

  // Register an rpc client for updates to all the bus stops in the array.
  var addStopWatchList = function(busStopList, objectRef) {
    for (var i = 0, len = busStopList.length; i < len; i++) {
      addStopWatch.call(this, busStopList[i], objectRef);
    }
  };

  // Remove rpc client from watch list.
  var removeWatchList = function(rpcId) {
    var deleteList = [];
    for (var stop in this._watchList) {
      if (this._watchList.hasOwnProperty(stop) && this._watchList[stop].hasOwnProperty(rpcId)) {
        delete this._watchList[stop][rpcId];
        if (Object.keys(this._watchList[stop]).length === 0) {
          deleteList.push(stop);
        }
      }
    }
    for (var i = 0, len = deleteList.length; i < len; i++) {
      delete this._watchList[deleteList[i]];
    }
    if (Object.keys(this._watchList).length === 0) {
      console.log("TFLCountdown - watch list empty");
    }
  };

  module.exports = TFLCountdownImpl;
}());