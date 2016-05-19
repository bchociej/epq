var Promise = require('bluebird');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

util.inherits(EasyPromiseQueue, EventEmitter);
module.exports = EasyPromiseQueue;

function EasyPromiseQueue(concurrency) {
	if (concurrency == null) {
		concurrency = Infinity;
	}

	this._nominalConcurrency = this._concurrency = null;
	this._running = [];
	this._queued = [];
	this._pending = false;
	this._stopped = false;
	this._tick = function() {};

	this.concurrency(concurrency);

	var ticking;
	var self = this;

	// factor into a more synchronized self-contained this.pinset() method or something
	function pend() {
		self._running = self._running.filter(function(r) { return r.isPending(); });

		if (!ticking || !ticking.isPending()) {
			ticking = Promise.fromCallback(function(cb) { self._tick = cb; });
		}

		if (self._running.length < self._concurrency && self._queued.length > 0) {
			var next = self._queued.shift();
			console.error('dequeued');

			self.runImmediately(next.work).asCallback(next.cb);
			self.emit('taskDequeued');

			if (self._queued.length === 0) {
				self.emit('queueEmpty');
			}

		} else if (self._running.length === 0) {
			if (self._nominalConcurrency === 0) {
				self.emit('halted');
				return;
			}

			self.emit('idle');
		}

		Promise.any(self._running.concat(ticking)).then(pend);

		return;
	};

	pend();
}

EasyPromiseQueue.prototype.add = function(work) {
	if (this._stopped || this._nominalConcurrency === 0) {
		throw new Error('cannot add(), work queue is stopped or killed');
	}

	this.emit('taskAdded');

	if (this._running.length >= this._concurrency) {
		var promise = Promise.fromCallback((function(_this) {
			return function(cb) {
				return _this._queued.push({
					work: work,
					cb: cb
				});
			};
		})(this));

		if (this._queued.length === 1) {
			this.emit('queuing');
		}

		this.emit('taskQueued');
		return promise;
	} else {
		return this.runImmediately(work);
	}
};

EasyPromiseQueue.prototype.runImmediately = function(work) {
	var self = this;

	if (this._concurrency === 0) {
		throw new Error('cannot runImmediately(), work queue is paused, stopped, or killed');
	}

	if (typeof work === 'function') {
		work = work();
	}

	var promise = Promise.resolve(work);
	var reflection = promise.reflect();

	this._running.push(reflection);

	reflection.tap((function(_this) {
		return function(inspection) {
			if (inspection.isFulfilled()) {
				_this.emit('taskFulfilled');
			}

			if (inspection.isRejected()) {
				_this.emit('taskRejected');
			}

			return _this.emit('taskFinished');
		};
	})(this));

	this.tick();

	if (this._running.length === 1) {
		this.emit('working');
	}

	this.emit('taskRunning');
	return promise;
};

EasyPromiseQueue.prototype.running = function() {
	return this._running.length;
};

EasyPromiseQueue.prototype.queueLength = function() {
	return this._queued.length;
};

EasyPromiseQueue.prototype.tick = function() {
	return this._tick();
};

EasyPromiseQueue.prototype.concurrency = function(newValue) {
	if (newValue != null) {
		if (newValue === true) {
			newValue = Infinity;
		} else if (newValue === false) {
			newValue = 1;
		}

		if (!(typeof newValue === 'number' && newValue > 0)) {
			throw new TypeError('concurrency must be a positive number');
		}

		if (this._concurrency !== 0) {
			this._concurrency = newValue;
		}

		this._nominalConcurrency = newValue;
		this.tick();
	}
	return this._nominalConcurrency;
};

EasyPromiseQueue.prototype.pause = function() {
	this.emit('paused');
	this._concurrency = 0;
	return this._stopped = false;
};

EasyPromiseQueue.prototype.stop = function() {
	this.emit('stopped');
	this._concurrency = 0;
	return this._stopped = true;
};

EasyPromiseQueue.prototype.resume = function() {
	this.emit('resuming');
	this._concurrency = this._nominalConcurrency;
	this._stopped = false;
	return this.tick();
};

EasyPromiseQueue.prototype.kill = function() {
	this.emit('killed');
	this._concurrency = this._nominalConcurrency = 0;
	this._stopped = true;
	this._queued.forEach(function(task) { task.cb('work queue has been killed'); });
	return this._queued = [];
};

EasyPromiseQueue.prototype.state = function() {
	if (this._nominalConcurrency === 0) {
		return 'killed';
	} else if (this._stopped) {
		return 'stopped';
	} else if (this._concurrency === 0) {
		return 'paused';
	} else {
		return 'active';
	}
};

EasyPromiseQueue.prototype.HCF = function() {
	this.kill();
	this._running.forEach(function(r) { r.cancel(); });
	this._running = [];
	this.emit('tasksAbandoned');
	return this.tick();
};
