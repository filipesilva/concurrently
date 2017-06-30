// Test basic usage of cli

var path = require('path');
var assert = require('assert');
var run = require('./utils').run;
var IS_WINDOWS = /^win/.test(process.platform);
var concurrently = require('../src/main');

// Note: Set the DEBUG_TESTS environment variable to `true` to see output of test commands.

var TEST_DIR = 'dir/';
var CLI_BIN = 'node ./src/cli.js';

// Abs path to test directory
var testDir = path.resolve(__dirname);
process.chdir(path.join(testDir, '..'));

describe('concurrently', function() {
    this.timeout(5000);

    it('help should be successful', () => {
        return run(CLI_BIN + ' --help')
            .then(function(exitCode) {
                // exit code 0 means success
                assert.strictEqual(exitCode, 0);
            });
    });

    it('version should be successful', () => {
        return run(CLI_BIN + ' -V')
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);
            });
    });

    it('two successful commands should exit 0', () => {
        return run(CLI_BIN + ' "echo test" "echo test"')
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);
            });
    });

    it('node API should be accessible', () => {
        return concurrently.run(['echo test', 'echo test'])
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);
            });
    });

    it('at least one unsuccessful commands should exit non-zero', () => {
        return run(CLI_BIN + ' "echo test" "nosuchcmd" "echo test"')
            .then(function(exitCode) {
                assert.notStrictEqual(exitCode, 0);
            });
    });

    it('--kill-others should kill other commands if one dies', () => {
        return run(CLI_BIN + ' --kill-others "sleep 1" "echo test" "sleep 0.1 && nosuchcmd"')
            .then(function(exitCode) {
                assert.notStrictEqual(exitCode, 0);
            });
    });

    it('--kill-others-on-fail should kill other commands if one exits with non-zero status code', () => {
        return run(CLI_BIN + ' --kill-others-on-fail "sleep 1" "exit 1" "sleep 1"')
            .then(function(exitCode) {
                assert.notStrictEqual(exitCode, 0);
            });
    });

    it('--kill-others-on-fail should NOT kill other commands if none of them exits with non-zero status code', (done) => {
        var readline = require('readline');
        var exits = 0;
        var sigtermInOutput = false;

        run(CLI_BIN + ' --kill-others-on-fail "echo killTest1" "echo killTest2" "echo killTest3"', {
            onOutputLine: function(line) {
                if (/SIGTERM/.test(line)) {
                    sigtermInOutput = true;
                }

                // waiting for exits
                if (/killTest\d$/.test(line)) {
                    exits++;
                }
            }
        }).then(function() {
            if(sigtermInOutput) {
                done(new Error('There was a "SIGTERM" in console output'));
            } else if (exits !== 3) {
                done(new Error('There was wrong number of echoes(' + exits + ') from executed commands'));
            } else {
                done();
            }
        });
    });

    it('--success=first should return first exit code', () => {
        return run(CLI_BIN + ' -k --success first "echo test" "sleep 0.1 && nosuchcmd"')
            // When killed, sleep returns null exit code
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);
            });
    });

    it('--success=last should return last exit code', () => {
        // When killed, sleep returns null exit code
        return run(CLI_BIN + ' -k --success last "echo test" "sleep 0.1 && nosuchcmd"')
            .then(function(exitCode) {
                assert.notStrictEqual(exitCode, 0);
            });
    });

    it('&& nosuchcmd should return non-zero exit code', () => {
        return run(CLI_BIN + ' "echo 1 && nosuchcmd" "echo 1 && nosuchcmd" ')
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 1);
            });
    });

    it('--prefix-colors should handle non-existent colors without failing', () => {
        return run(CLI_BIN + ' -c "not.a.color" "echo colors"')
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);
            });
    });

    it('--prefix should default to "index"', () => {
        var collectedLines = []

        return run(CLI_BIN + ' "echo one" "echo two"', {
            onOutputLine: (line) => {
                if (/(one|two)$/.exec(line)) {
                    collectedLines.push(line)
                }
            }
        })
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);

                collectedLines.sort()
                assert.deepEqual(collectedLines, [
                    '[0] one',
                    '[1] two'
                ])
            });
    });

    it('--names should set a different default prefix', () => {
        var collectedLines = []

        return run(CLI_BIN + ' -n aa,bb "echo one" "echo two"', {
            onOutputLine: (line) => {
                if (/(one|two)$/.exec(line)) {
                    collectedLines.push(line)
                }
            }
        })
            .then(function(exitCode) {
                assert.strictEqual(exitCode, 0);

                collectedLines.sort()
                assert.deepEqual(collectedLines, [
                    '[aa] one',
                    '[bb] two'
                ])
            });
    });

    ['SIGINT', 'SIGTERM'].forEach((signal) => {
      if (IS_WINDOWS) {
          console.log('IS_WINDOWS=true');
          console.log('Skipping SIGINT/SIGTERM propagation tests ..');
          return;
      }

      it('killing it with ' + signal + ' should propagate the signal to the children', function(done) {
        var readline = require('readline');
        var waitingStart = 2;
        var waitingSignal = 2;

        function waitForSignal(cb) {
          if (waitingSignal) {
            setTimeout(waitForSignal, 100);
          } else {
            cb();
          }
        }

        run(CLI_BIN + ' "node ./test/support/signal.js" "node ./test/support/signal.js"', {
          onOutputLine: function(line, child) {
            // waiting for startup
            if (/STARTED/.test(line)) {
              waitingStart--;
            }
            if (!waitingStart) {
              // both processes are started
              child.kill(signal);
            }

            // waiting for signal
            if (new RegExp(signal).test(line)) {
              waitingSignal--;
            }
          }
        }).then(function() {
          waitForSignal(done);
        });
      });
    });
});

function resolve(relativePath) {
    return path.join(testDir, relativePath);
}
