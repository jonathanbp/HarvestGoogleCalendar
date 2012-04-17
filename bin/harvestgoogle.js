var GoogleCalendar, GoogleClientLogin, HTTPS, Harvest, Harvester, Program, Prompt, cliff, moment, natural, p, yaml, _;
var __hasProp = Object.prototype.hasOwnProperty, __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (__hasProp.call(this, i) && this[i] === item) return i; } return -1; };

GoogleClientLogin = require('googleclientlogin').GoogleClientLogin;

Prompt = require("prompt");

Program = require('commander');

HTTPS = require("https");

moment = require("moment");

_ = require("underscore");

natural = require("natural");

yaml = require("js-yaml");

require("colors");

cliff = require("cliff");

Program.version('0.0.2').option('-c, --configuration [file]', "Location of configuration file.").option('-a, --action [action]', "Execute action. Available actions are: " + "'tasks'".bold + " to show a list of available tasks in Harvest, " + "'clear'".bold + " to clear all linked tasks in Harvest. Leave blank to synchronize.").option('-u, --user [username]', 'Google username').option('-p, --harvestpass [pass]', 'Password for Harvest').option('-g, --googlepass [pass]', 'Password for Google').option('-c, --calendar [calendar]', "Name of Google Calendar").option('-r, --range [YYYYMMDD]..[YYYYMMDD]', 'A timerange', function(val) {
  var r;
  r = val.split("..");
  return {
    from: r[0],
    to: r[1]
  };
}).parse(process.argv);

/*
Google Calendar
*/

GoogleCalendar = (function() {

  function GoogleCalendar(user, password, login, fail) {
    var _this = this;
    this.user = user;
    this.password = password;
    this.maxResults = 1000;
    this.auth = new GoogleClientLogin({
      email: this.user,
      password: this.password,
      service: "calendar",
      accountType: GoogleClientLogin.accountTypes.google
    });
    this.authenticated = false;
    this.auth.on(GoogleClientLogin.events.login, function() {
      _this.authenticated = true;
      return login();
    });
    this.auth.on(GoogleClientLogin.events.error, function(e) {
      return fail();
    });
    this.auth.login();
  }

  GoogleCalendar.prototype.events = function(query, data, fail) {
    var options, path, request;
    if (this.authenticated) {
      query.from = "" + query.from.slice(0, 4) + "-" + query.from.slice(4, 6) + "-" + query.from.slice(6, 8);
      query.to = "" + query.to.slice(0, 4) + "-" + query.to.slice(4, 6) + "-" + query.to.slice(6, 8);
      path = "/calendar/v3/calendars/" + (encodeURIComponent(query.calendar)) + "/events?key=AIzaSyB-wuGViS_V9ZZpF_GQVQxrxtnw2E3iL3c&timeMin=" + (encodeURIComponent(query.from + "T00:00:00.000Z")) + "&timeMax=" + (encodeURIComponent(query.to + "T00:00:00.000Z")) + "&maxResults=" + this.maxResults;
      options = {
        host: 'www.googleapis.com',
        path: path,
        method: 'GET',
        headers: {
          'Authorization': 'GoogleLogin auth=' + this.auth.getAuthId()
        }
      };
      request = HTTPS.request(options, function(res) {
        var chunks;
        chunks = "";
        res.on('data', function(chunk) {
          return chunks += chunk;
        });
        return res.on('end', function() {
          var event, events, _fn, _i, _len;
          events = JSON.parse(chunks).items;
          _fn = function(event) {
            var _ref, _ref2;
            if ((((_ref = event.start) != null ? _ref.dateTime : void 0) != null) && (((_ref2 = event.end) != null ? _ref2.dateTime : void 0) != null)) {
              return event.duration_in_hours = parseFloat(moment(event.end.dateTime).diff(moment(event.start.dateTime), "hours", true)).toFixed(2);
            }
          };
          for (_i = 0, _len = events.length; _i < _len; _i++) {
            event = events[_i];
            _fn(event);
          }
          events = _.filter(events, function(event) {
            return !(event.recurrence != null);
          });
          return data(events);
        });
      });
      request.end();
      return request.on("error", fail);
    }
  };

  return GoogleCalendar;

})();

/*
Harvest
*/

Harvest = (function() {

  function Harvest(user, password, login, fail) {
    var basicauth, options, request;
    var _this = this;
    this.user = user;
    this.password = password;
    basicauth = new Buffer("" + this.user + ":" + this.password).toString('base64').trim();
    this.headers = {
      "Accept": "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": "Basic " + basicauth,
      "User-Agent": "Cetrea Harvester/" + (Program.version())
    };
    this.host = "cetrea.harvestapp.com";
    options = {
      host: this.host,
      path: "/account/who_am_i",
      headers: this.headers
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      if (res.statusCode !== 200) fail();
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        _this.me = JSON.parse(chunks);
        if (res.statusCode === 200) {
          return login();
        } else {
          return fail();
        }
      });
    });
    request.end();
    request.on("error", fail);
  }

  Harvest.prototype.projects = function(ps, fail) {
    var options, request;
    var _this = this;
    options = {
      host: this.host,
      path: "/projects",
      headers: this.headers
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        _this.projects = _.pluck(JSON.parse(chunks), "project");
        _this.project_lookup = _.reduce(_this.projects, (function(memo, project) {
          memo[project.id] = project;
          return memo;
        }), {});
        return ps(_this.projects);
      });
    });
    request.end();
    return request.on("error", fail);
  };

  Harvest.prototype.tasks = function(ts, fail) {
    var options, request;
    var _this = this;
    options = {
      host: this.host,
      path: "/tasks",
      headers: this.headers
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        _this.tasks = _.pluck(JSON.parse(chunks), "task");
        _this.task_lookup = _.reduce(_this.tasks, (function(memo, task) {
          memo[task.id] = task;
          return memo;
        }), {});
        return ts(_this.tasks);
      });
    });
    request.end();
    return request.on("error", fail);
  };

  Harvest.prototype.arewedone = function(done) {
    this.requests -= 1;
    if (this.requests <= 0) return done();
  };

  Harvest.prototype.projectsandtasks = function(ps, tfp, done, fail) {
    var _this = this;
    return this.projects((function(projects) {
      ps(projects);
      return _this.tasks((function(tasks) {
        var project, _i, _len, _results;
        _this.requests = projects.length;
        _results = [];
        for (_i = 0, _len = projects.length; _i < _len; _i++) {
          project = projects[_i];
          _results.push((function(project) {
            var options, task_request;
            options = {
              host: _this.host,
              path: "/projects/" + project.id + "/task_assignments",
              headers: _this.headers
            };
            task_request = HTTPS.request(options, function(res) {
              var chunks;
              chunks = "";
              res.on('data', function(chunk) {
                return chunks += chunk;
              });
              return res.on('end', function() {
                var ta, taskassignments, _fn, _j, _len2;
                try {
                  taskassignments = _.pluck(JSON.parse(chunks), "task_assignment");
                  _fn = function(ta) {
                    return ta.task = _this.task_lookup[ta.task_id];
                  };
                  for (_j = 0, _len2 = taskassignments.length; _j < _len2; _j++) {
                    ta = taskassignments[_j];
                    _fn(ta);
                  }
                  tfp(project, taskassignments);
                  return _this.arewedone(done);
                } catch (error) {
                  _this.arewedone(done);
                  return console.log(("✘ Could not retrieve tasks for project: " + (project != null ? project.name : void 0) + " (" + error + ")").red);
                }
              });
            });
            task_request.end();
            return task_request.on("error", fail);
          })(project));
        }
        return _results;
      }), fail);
    }), fail);
  };

  Harvest.prototype.entries = function(from, to, data, fail) {
    var options, path, request;
    path = "/people/" + this.me.user.id + "/entries?from=" + from + "&to=" + to;
    options = {
      host: this.host,
      path: path,
      headers: this.headers
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        var entries, entry, _fn, _i, _len;
        entries = _.pluck(JSON.parse(chunks), "day_entry");
        _fn = function(entry) {
          return entry.duration_in_hours = parseFloat(entry.hours).toFixed(2) || 0;
        };
        for (_i = 0, _len = entries.length; _i < _len; _i++) {
          entry = entries[_i];
          _fn(entry);
        }
        return data(entries);
      });
    });
    request.end();
    return request.on("error", fail);
  };

  /* 
    entry 
      hours (int) REQUIRED
      project_id (str) REQUIRED
      task_id (str) REQUIRED
      spent_at (date) REQUIRED
      notes (str) OPTIONAL
  */

  Harvest.prototype.create = function(entry, success, fail) {
    var data, headers, options, path, request;
    data = JSON.stringify(entry);
    headers = this.headers;
    headers["Content-Length"] = data.length;
    path = "/daily/add";
    options = {
      host: this.host,
      path: path,
      headers: this.headers,
      method: "POST"
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      if (res.statusCode !== 201) {
        return fail();
      } else {
        chunks = "";
        res.on('data', function(chunk) {
          return chunks += chunk;
        });
        return res.on('end', function() {
          return success(JSON.parse(chunks));
        });
      }
    });
    request.write(data);
    request.end();
    return request.on("error", fail);
  };

  /* 
    entry
      hours (int) REQUIRED
      project_id (str) REQUIRED
      task_id (str) REQUIRED
      spent_at (date) REQUIRED
      notes (str) OPTIONAL
  */

  Harvest.prototype.update = function(id, entry, success, fail) {
    var data, headers, options, path, request;
    data = JSON.stringify(entry);
    headers = this.headers;
    headers["Content-Length"] = data.length;
    path = "/daily/update/" + id;
    options = {
      host: this.host,
      path: path,
      headers: this.headers,
      method: "POST"
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      if (res.statusCode !== 200) fail();
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        if (res.statusCode === 200) return success(JSON.parse(chunks));
      });
    });
    request.write(data);
    request.end();
    return request.on("error", fail);
  };

  Harvest.prototype["delete"] = function(id, success, fail) {
    var headers, options, path, request;
    headers = this.headers;
    headers["Content-Length"] = 0;
    path = "/daily/delete/" + id;
    options = {
      host: this.host,
      path: path,
      headers: this.headers,
      method: "DELETE"
    };
    request = HTTPS.request(options, function(res) {
      var chunks;
      if (res.statusCode !== 200) fail();
      chunks = "";
      res.on('data', function(chunk) {
        return chunks += chunk;
      });
      return res.on('end', function() {
        if (res.statusCode === 200) {
          return success();
        } else {
          return fail(chunks);
        }
      });
    });
    request.end();
    return request.on("error", fail);
  };

  Harvest.prototype.isCalendared = function(entry) {
    var _ref;
    return (entry != null ? (_ref = entry.notes) != null ? _ref.indexOf("harvested:") : void 0 : void 0) >= 0;
  };

  return Harvest;

})();

Harvester = (function() {

  function Harvester(user, googlepass, harvestpass, calendar, range) {
    this.user = user;
    this.googlepass = googlepass;
    this.harvestpass = harvestpass;
    this.calendar = calendar;
    this.range = range;
    this.nounInflector = new natural.NounInflector();
    this.verbInflector = new natural.PresentVerbInflector();
  }

  Harvester.prototype.noun = function(word, n) {
    if (n === 1) {
      return this.nounInflector.singularize(word);
    } else {
      return this.nounInflector.pluralize(word);
    }
  };

  Harvester.prototype.verb = function(word, n) {
    if (n === 1) {
      return this.verbInflector.singularize(word);
    } else {
      return this.verbInflector.pluralize(word);
    }
  };

  Harvester.prototype.run = function(program) {
    var _this = this;
    this.program = program;
    console.log("⬆ Harvest: Authenticating ...".blue);
    return this.harvest = new Harvest(this.user, this.harvestpass, (function() {
      return _this._0_harvestauthenticated();
    }), (function() {
      return _this.fail("Unable to authenticate with Harvest.");
    }));
  };

  Harvester.prototype._0_harvestauthenticated = function() {
    var _this = this;
    console.log("✔ Harvest: Authenticated".green);
    if (this.program.action === "tasks") {
      return this.harvest.projectsandtasks((function(projects) {
        return console.log("" + projects.length + " projects");
      }), (function(project, taskassignments) {
        var ta, _i, _len, _results;
        var _this = this;
        _results = [];
        for (_i = 0, _len = taskassignments.length; _i < _len; _i++) {
          ta = taskassignments[_i];
          _results.push((function(ta) {
            return console.log("" + project.id + "\t" + ta.task.id + "\t" + project.name + "\t" + ta.task.name);
          })(ta));
        }
        return _results;
      }), this._N_exit, (function() {
        return _this.fail("Could not get tasks from Harvest");
      }));
    } else if (this.program.action === "clear") {
      return this.harvest.entries(this.range.from, this.range.to, (function(entries) {
        var entry, _i, _len, _results;
        _results = [];
        for (_i = 0, _len = entries.length; _i < _len; _i++) {
          entry = entries[_i];
          if ((entry != null ? entry.hours : void 0) !== "0.0" && _this.harvest.isCalendared(entry)) {
            _results.push((function(entry) {
              return _this.harvest["delete"](entry.id, (function() {
                return console.log(("✔ Deleted " + entry.id + " successfully").green);
              }), (function() {
                return _this.fail("Could not delete entry (" + entry.id + ") in Harvest");
              }));
            })(entry));
          }
        }
        return _results;
      }), (function() {
        return _this.fail("Harvest: Retrieving existing harvest entries failed.");
      }));
    } else {
      console.log("⬆ Google: Authenticating ...".blue);
      return this.cal = new GoogleCalendar(this.user, this.googlepass, (function() {
        return _this._1_googleauthenticated();
      }), (function() {
        return _this.fail("Unable to authenticate with Google");
      }));
    }
  };

  Harvester.prototype._1_googleauthenticated = function() {
    var _this = this;
    console.log("✔ Google: Authenticated".green);
    console.log("⬇ Harvest: Harvesting ...".blue);
    return this.harvest.entries(this.range.from, this.range.to, (function(entries) {
      return _this._2_harvestharvested(entries);
    }), (function() {
      return _this.fail("Harvest: Retrieving existing harvest entries failed.");
    }));
  };

  Harvester.prototype._2_harvestharvested = function(entries) {
    var entry, _fn, _i, _len, _ref;
    var _this = this;
    this.calendaredEntries = (function() {
      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = entries.length; _i < _len; _i++) {
        entry = entries[_i];
        if ((entry != null ? entry.hours : void 0) !== "0.0" && this.harvest.isCalendared(entry)) {
          _results.push(entry);
        }
      }
      return _results;
    }).call(this);
    _ref = this.calendaredEntries;
    _fn = function(entry) {
      return entry.event_id = /harvested:(\S*)/g.exec(entry != null ? entry.notes : void 0)[1];
    };
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      entry = _ref[_i];
      _fn(entry);
    }
    console.log(("✔ Harvest: Harvested " + entries.length + " existing " + (this.noun("entry", entries.length)) + ". " + this.calendaredEntries.length + " " + (this.verb("are", this.calendaredEntries.length)) + " calendared already.").green);
    console.log("⬇ Google: Harvesting ...".blue);
    return this.cal.events({
      calendar: this.calendar,
      from: this.range.from,
      to: this.range.to
    }, (function(data) {
      return _this._3_googleharvested(data);
    }), (function() {
      return _this.fail("Google: Retrieving events failed");
    }));
  };

  Harvester.prototype._3_googleharvested = function(events) {
    var deletable_harvest_entries, deleted_event_ids, entry, event, event_lookup, known_harvested_event_ids, matching_events, new_events, summary, updatable_harvest_entries, updated_event_ids, updated_events, _fn, _i, _len;
    var _this = this;
    if (events.length === this.cal.maxResults) {
      this.fail("Google: MaxResults (" + this.cal.maxResults + ") exceeded, try with a smaller range");
    }
    console.log(("✔ Google: Harvested " + events.length + " " + (this.noun("event", events.length)) + ". Now looking for matches.").green);
    known_harvested_event_ids = (function() {
      var _i, _len, _ref, _results;
      _ref = this.calendaredEntries;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        entry = _ref[_i];
        _results.push(entry != null ? entry.event_id : void 0);
      }
      return _results;
    }).call(this);
    updated_events = (function() {
      var _i, _len, _ref, _results;
      _results = [];
      for (_i = 0, _len = events.length; _i < _len; _i++) {
        event = events[_i];
        if (_ref = event.id, __indexOf.call(known_harvested_event_ids, _ref) >= 0) {
          _results.push(event);
        }
      }
      return _results;
    })();
    updated_event_ids = (function() {
      var _i, _len, _results;
      _results = [];
      for (_i = 0, _len = updated_events.length; _i < _len; _i++) {
        event = updated_events[_i];
        _results.push(event.id);
      }
      return _results;
    })();
    deleted_event_ids = _.difference(known_harvested_event_ids, updated_event_ids);
    deletable_harvest_entries = (function() {
      var _i, _len, _ref, _ref2, _results;
      _ref = this.calendaredEntries;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        entry = _ref[_i];
        if (_ref2 = entry != null ? entry.event_id : void 0, __indexOf.call(deleted_event_ids, _ref2) >= 0) {
          _results.push(entry);
        }
      }
      return _results;
    }).call(this);
    updatable_harvest_entries = (function() {
      var _i, _len, _ref, _ref2, _results;
      _ref = this.calendaredEntries;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        entry = _ref[_i];
        if (_ref2 = entry != null ? entry.event_id : void 0, __indexOf.call(updated_event_ids, _ref2) >= 0) {
          _results.push(entry);
        }
      }
      return _results;
    }).call(this);
    event_lookup = _.reduce(events, (function(memo, event) {
      memo[event.id] = event;
      return memo;
    }), {});
    updatable_harvest_entries = _.filter(updatable_harvest_entries, function(entry) {
      var calendared_duration_in_hours;
      calendared_duration_in_hours = event_lookup[entry != null ? entry.event_id : void 0].duration_in_hours;
      if ((entry != null ? entry.duration_in_hours : void 0) !== calendared_duration_in_hours) {
        if (entry != null) {
          entry.new_duration_in_hours = calendared_duration_in_hours;
        }
        return true;
      } else {
        return false;
      }
    });
    new_events = (function() {
      var _i, _len, _ref, _results;
      _results = [];
      for (_i = 0, _len = events.length; _i < _len; _i++) {
        event = events[_i];
        if (_ref = event.id, __indexOf.call(updated_event_ids, _ref) < 0) {
          _results.push(event);
        }
      }
      return _results;
    })();
    matching_events = _.filter(new_events, function(event) {
      return _.any(Program.configuration.mappings, function(mapping) {
        return _.all(mapping.rules, function(rule) {
          var property, regex;
          for (property in rule) {
            regex = rule[property];
            if (new RegExp(regex).test(event[property])) {
              event.matched_by = mapping;
              return true;
            } else {
              return false;
            }
          }
        });
      });
    });
    summary = [["Name ", "Time ", "Duration ", "Matched By ", "Action "]];
    _fn = function(event) {
      return summary.push([event.summary, moment(event.start.dateTime).format("MMMM Do YYYY, H:mm:ss"), event.duration_in_hours, "" + event.matched_by.name, "ADD".green + (" " + event.matched_by.project_id + " " + event.matched_by.task_id)]);
    };
    for (_i = 0, _len = matching_events.length; _i < _len; _i++) {
      event = matching_events[_i];
      _fn(event);
    }
    _.each(_.map(deletable_harvest_entries, function(entry) {
      return [("Harvest Task #" + entry.id).italic, moment(entry.spent_at).format("MMMM Do YYYY, H:mm:ss"), entry.duration_in_hours, "N/A".italic, "DELETE".red + (" " + entry.id)];
    }), function(line) {
      return summary.push(line);
    });
    _.each(_.map(updatable_harvest_entries, function(entry) {
      return [("Harvest Task #" + entry.id).italic, moment(entry.spent_at).format("MMMM Do YYYY, H:mm:ss"), entry.duration_in_hours, "N/A".italic, "UPDATE".blue + (" " + entry.id + ", hours => " + entry.new_duration_in_hours)];
    }), function(line) {
      return summary.push(line);
    });
    if (summary.length === 1) {
      console.log("•" + " Nothing to do. Put more stuff in your calendar and/or create more mappings".grey);
      this._N_exit();
    }
    console.log("•" + " A summary of the synchronization is printed below.".grey);
    console.log(cliff.stringifyRows(summary, ["bold", "bold", "bold", "bold", "bold"]));
    return (function(harvest, updates, deletes, creates) {
      Prompt.start();
      return Prompt.get([
        {
          name: "continue",
          validator: /^[YyNn]/,
          message: "Continue and perform changes in Harvest? [Y/N]"
        }
      ], function(err, result) {
        var entry, event, _fn2, _fn3, _j, _k, _l, _len2, _len3, _len4, _results;
        if (/[Yy]/.test(result["continue"])) {
          console.log("•" + " Lets do it!".grey);
          _fn2 = function(entry) {
            var _this = this;
            return harvest.update(entry.id, {
              hours: entry.new_duration_in_hours
            }, (function(result) {
              return console.log(("✔ Updated " + entry.id + " successfully").green);
            }), (function() {
              return _this.fail("Could not update entry " + entry.id + " in Harvest");
            }));
          };
          for (_j = 0, _len2 = updates.length; _j < _len2; _j++) {
            entry = updates[_j];
            _fn2(entry);
          }
          _fn3 = function(entry) {
            var _this = this;
            return harvest["delete"](entry.id, (function() {
              return console.log(("✔ Deleted " + entry.id + " successfully").green);
            }), (function() {
              return _this.fail("Could not delete entry (" + entry.id + ") in Harvest");
            }));
          };
          for (_k = 0, _len3 = deletes.length; _k < _len3; _k++) {
            entry = deletes[_k];
            _fn3(entry);
          }
          _results = [];
          for (_l = 0, _len4 = creates.length; _l < _len4; _l++) {
            event = creates[_l];
            _results.push((function(event) {
              return harvest.create({
                hours: event.duration_in_hours,
                project_id: event.matched_by.project_id,
                task_id: event.matched_by.task_id,
                spent_at: moment(event.start.dateTime).format("ddd, D MMM YYYY"),
                notes: "" + (escape(event.summary)) + " - harvested:" + event.id
              }, (function(result) {
                return console.log(("✔ Created Harvest entry from \"" + event.summary + "\" on " + (moment(event.start.dateTime).format("ddd, D MMM YYYY")) + " successfully").green);
              }), (function() {
                return _this.fail("Could not create entry " + entry.id + " - \"" + event.summary + "\" in Harvest");
              }));
            })(event));
          }
          return _results;
        } else {
          console.log("Ok, nevermind then.".red);
          return _this._N_exit();
        }
      });
    })(this.harvest, updatable_harvest_entries, deletable_harvest_entries, matching_events);
  };

  Harvester.prototype._N_exit = function() {
    return process.exit(0);
  };

  Harvester.prototype.fail = function(msg) {
    console.log(("✘ " + msg).red);
    return process.exit(1);
  };

  return Harvester;

})();

Prompt.message = "•";

Prompt.delimiter = " ";

Prompt.start();

Prompt.get((function() {
  var _i, _len, _ref, _results;
  _ref = [
    !(Program.configuration != null) ? {
      name: "configuration",
      message: "Please input location of your configuration file. "
    } : void 0
  ];
  _results = [];
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    p = _ref[_i];
    if (p != null) _results.push(p);
  }
  return _results;
})(), function(err, result) {
  var p, _ref, _ref2;
  try {
    Program.configuration = require((_ref = Program.configuration) != null ? _ref : result.configuration).shift();
  } catch (error) {
    console.log(("✘ Could not find or parse configuration file (" + ((_ref2 = Program.configuration) != null ? _ref2 : result.configuration) + ")").red);
    process.exit(1);
  }
  return Prompt.get((function() {
    var _i, _len, _ref10, _ref11, _ref12, _ref3, _ref4, _ref5, _ref6, _ref7, _ref8, _ref9, _results;
    _ref12 = [
      !(Program.user != null) && !(((_ref3 = Program.configuration) != null ? _ref3.user : void 0) != null) ? {
        name: "user",
        message: "What is your username (exclude @c3a.dk)? "
      } : void 0, !((_ref4 = Program.action) === "tasks" || _ref4 === "clear") && !(Program.googlepass != null) && !(((_ref5 = Program.configuration) != null ? _ref5.googlepass : void 0) != null) ? {
        name: "googlepass",
        message: "What is your Google password? ",
        hidden: true
      } : void 0, !(Program.harvestpass != null) && !(((_ref6 = Program.configuration) != null ? _ref6.harvestpass : void 0) != null) ? {
        name: "harvestpass",
        message: "What is your Harvest password? ",
        hidden: true
      } : void 0, !(Program.action != null) && !(Program.calendar != null) && !(((_ref7 = Program.configuration) != null ? _ref7.calendar : void 0) != null) ? {
        name: "calendar",
        message: "Enter calendar from which to extract events. "
      } : void 0, Program.action !== "tasks" && !(Program.range != null) && !(((_ref8 = Program.configuration) != null ? (_ref9 = _ref8.range) != null ? _ref9.from : void 0 : void 0) != null) ? {
        name: "from",
        message: "Enter the start date for the search in the form YYYYMMDD. "
      } : void 0, Program.action !== "tasks" && !(Program.range != null) && !(((_ref10 = Program.configuration) != null ? (_ref11 = _ref10.range) != null ? _ref11.to : void 0 : void 0) != null) ? {
        name: "to",
        message: "Enter the end date for the search in the form YYYYMMDD. "
      } : void 0
    ];
    _results = [];
    for (_i = 0, _len = _ref12.length; _i < _len; _i++) {
      p = _ref12[_i];
      if (p != null) _results.push(p);
    }
    return _results;
  })(), function(err, result) {
    var harvester, _ref10, _ref11, _ref12, _ref13, _ref14, _ref15, _ref16, _ref17, _ref3, _ref4, _ref5, _ref6, _ref7, _ref8, _ref9;
    harvester = new Harvester((_ref3 = (_ref4 = Program.user) != null ? _ref4 : (_ref5 = Program.configuration) != null ? _ref5.user : void 0) != null ? _ref3 : result.user, (_ref6 = (_ref7 = Program.googlepass) != null ? _ref7 : (_ref8 = Program.configuration) != null ? _ref8.googlepass : void 0) != null ? _ref6 : result.googlepass, (_ref9 = (_ref10 = Program.harvestpass) != null ? _ref10 : (_ref11 = Program.configuration) != null ? _ref11.harvestpass : void 0) != null ? _ref9 : result.harvestpass, (_ref12 = (_ref13 = Program.calendar) != null ? _ref13 : (_ref14 = Program.configuration) != null ? _ref14.calendar : void 0) != null ? _ref12 : result.calendar, (_ref15 = (_ref16 = Program.range) != null ? _ref16 : (_ref17 = Program.configuration) != null ? _ref17.range : void 0) != null ? _ref15 : {
      from: result.from,
      to: result.to
    });
    return harvester.run(Program);
  });
});
