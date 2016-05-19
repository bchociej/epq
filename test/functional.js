var EPQ = require('../lib/epq');
var Promise = require('bluebird');
var assert = require('assert');

var mkprom = function() {
	var result = {};

	result.promise = new Promise(function(resolve, reject) {
		result.resolve = resolve; result.reject = reject;
	});

	return result;
}

describe('epq', function() {
	it('performs basic initialization', function() {
		var q = new EPQ(3);

		assert.equal(q.running(), 0);
		assert.equal(q.queueLength(), 0);
		assert.equal(q.concurrency(), 3);
		assert.equal(q.state(), 'active');
	});

	it('adds, runs, queues, and dequeues tasks ok', function() {
		var q = new EPQ(3);
		var p1 = mkprom();
		var p2 = mkprom();
		var p3 = mkprom();
		var p4 = mkprom();

		q.add(p1.promise).then(function(value) {
			console.error('p1 test then');
			assert.equal(value, 'hi');
			assert.equal(q.running(), 3);
			assert.equal(q.queueLength(), 0);
		});

		q.add(p2.promise).then(function(value) {
			assert.equal(value, 'bye');
		});

		q.add(p3.promise).then(function(value) {
			assert.equal(value, 'sup');
		});

		q.add(p4.promise).catch(function(reason) {
			assert.equal(reason, 'boo');
		});

		p1.resolve('hi');
	});
});
