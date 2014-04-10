#!/usr/bin/env node

GoogleClientLogin = require('googleclientlogin').GoogleClientLogin
Prompt = require("prompt")
Program = require('commander')
HTTPS = require("https")
moment = require("moment")
_ = require("underscore")
natural = require("natural")
yaml = require("js-yaml")
require("colors")
cliff = require("cliff")

Program
  .version('0.0.9')
  .option('-c, --configuration [file]', "Location of configuration file.")
  .option('-a, --action [action]', "Execute action. Available actions are: " + "'tasks'".bold + " to show a list of available tasks in Harvest, " + "'clear'".bold + " to clear all linked tasks in Harvest. Leave blank to synchronize.")
  .option('-u, --user [username]', 'Google username')
  .option('-p, --harvestpass [pass]', 'Password for Harvest')
  .option('-d, --harvestdomain [domain]', "The Harvest domain, e.g. you access Harvest at http://" + "mydomain".bold + ".harvestapp.com/.")
  .option('-g, --googlepass [pass]', 'Password for Google')
  .option('-c, --calendar [calendar]', "Name of Google Calendar")
  .option('-r, --range [YYYYMMDD]..[YYYYMMDD]', 'A timerange', 
    (val) -> 
      r = val.split("..")
      { from: r[0], to: r[1] }
  )
  .parse(process.argv);


###
Google Calendar
###
class GoogleCalendar 
  constructor: (@user, @password, login, fail) ->
    @maxResults = 1000
    @auth = new GoogleClientLogin(
      email: @user
      password: @password
      service: "calendar"
      accountType: GoogleClientLogin.accountTypes.google
    )
    @authenticated = false
    @auth.on(
      GoogleClientLogin.events.login, 
      () => 
        @authenticated = true
        login()
    )
    @auth.on(
      GoogleClientLogin.events.error, 
      (e) -> 
        fail()
    )
    @auth.login()

  events: (query, data, fail) ->
    if @authenticated
      query.from = "#{query.from[0..3]}-#{query.from[4..5]}-#{query.from[6..7]}"
      query.to = "#{query.to[0..3]}-#{query.to[4..5]}-#{query.to[6..7]}"
      path = "/calendar/v3/calendars/#{encodeURIComponent(query.calendar)}/events?key=AIzaSyB-wuGViS_V9ZZpF_GQVQxrxtnw2E3iL3c&timeMin=#{encodeURIComponent(query.from+"T00:00:00.000Z")}&timeMax=#{encodeURIComponent(query.to+"T00:00:00.000Z")}&maxResults=#{@maxResults}"
      options = 
        host: 'www.googleapis.com'
        path: path
        method: 'GET'
        headers: {
          'Authorization': 'GoogleLogin auth=' + @auth.getAuthId(),
        }
      request = HTTPS.request(
        options
        (res) ->
          #console.log("statusCode: ", res.statusCode)
          #console.log("headers: ", res.headers)
          chunks = ""
          res.on('data', (chunk) -> chunks += chunk)
          
          res.on('end', 
            () -> 
              events = JSON.parse(chunks).items
              for event in events
                do (event) ->
                  if event.start?.dateTime? and event.end?.dateTime?
                    event.duration_in_hours = parseFloat(moment(event.end.dateTime).diff(moment(event.start.dateTime),"hours",true)).toFixed(2)
              # we do not want the original recurrence
              events = _.filter(events, (event) -> not event.recurrence?)
              data(events)
          )
      )
      request.end()
      request.on("error", fail)

###
Harvest
###
class Harvest

  constructor: (@user, @password, @domain, login, fail) -> 
    # login
    basicauth = new Buffer("#{@user}:#{@password}").toString('base64').trim()

    @headers =
      "Accept" : "application/json"
      "Content-Type" : "application/json; charset=utf-8"
      "Authorization" : "Basic #{basicauth}"
      "User-Agent" :  "Cetrea Harvester/#{Program.version()}"

    @host = "#{domain}.harvestapp.com"

    options =
      host: @host
      path: "/account/who_am_i"
      headers: @headers

    request = HTTPS.request(
      options
      (res) =>
        fail() if res.statusCode isnt 200  
        chunks = ""
        res.on('data', (chunk) -> chunks += chunk)
        res.on('end', 
          () => 
            @me = JSON.parse(chunks)
            if res.statusCode == 200 
              login()
            else
              fail()
        ) 
    )
    request.end()
    request.on("error", fail)

  projects: (ps,fail) ->
    options =
      host: @host
      path: "/projects"
      headers: @headers

    request = HTTPS.request(
      options
      (res) =>
        chunks = ""
        res.on('data', 
          (chunk) -> chunks += chunk
        )
        res.on('end', 
          () =>
            @projects = _.pluck(JSON.parse(chunks),"project")
            @project_lookup = _.reduce(@projects, ((memo, project) -> memo[project.id] = project; memo), {})
            ps(@projects)
        )
    )
    request.end()
    request.on("error", fail)

  tasks: (ts, fail) ->
    options =
      host: @host
      path: "/tasks"
      headers: @headers

    request = HTTPS.request(
      options
      (res) =>
        chunks = ""
        res.on('data', 
          (chunk) -> chunks += chunk
        )
        res.on('end', 
          () =>
            @tasks = _.pluck(JSON.parse(chunks),"task")
            @task_lookup = _.reduce(@tasks, ((memo, task) -> memo[task.id] = task; memo), {})
            ts(@tasks)
        )
    )
    request.end()
    request.on("error", fail)

  arewedone: (done) ->
    @requests -= 1
    if @requests <= 0 
      done()


  projectsandtasks: (ps, tfp, done, fail) ->
    # first retrieve all projects
    @projects(
      ((projects) =>
       
        ps(projects)
        # then retrieve all tasks
        @tasks(
          ((tasks) =>
            # create a lookup
            @requests = projects.length

            # find assignments
            for project in projects
              do (project) =>
                options =
                  host: @host
                  path: "/projects/#{project.id}/task_assignments"
                  headers: @headers

                task_request = HTTPS.request(
                  options
                  (res) =>
                    chunks = ""
                    res.on('data', 
                      (chunk) -> 
                        chunks += chunk
                    )
                    res.on('end', 
                      () => 
                        try
                          taskassignments = _.pluck(JSON.parse(chunks), "task_assignment")
                          for ta in taskassignments
                            do (ta) =>
                              ta.task = @task_lookup[ta.task_id]

                          tfp(project, taskassignments)

                          @arewedone(done)

                        catch error
                          @arewedone(done)
                          console.log "✘ Could not retrieve tasks for project: #{project?.name} (#{error})".red
                    )
                )
                task_request.end()
                task_request.on("error", fail)
          ),
          fail
        )
      ),
      fail
    )


  # retrieve all hours in given range
  entries: (from, to, data, fail) ->
    path = "/people/#{@me.user.id}/entries?from=#{from}&to=#{to}"
    options =
      host: @host
      path: path
      headers: @headers

    request = HTTPS.request(
      options
      (res) ->
        chunks = ""
        res.on('data', (chunk) -> chunks += chunk)
        res.on('end', 
          () ->
            # enrich content (duration in hours as a float)
            entries = _.pluck(JSON.parse(chunks),"day_entry")
            for entry in entries
              do (entry) ->
                entry.duration_in_hours = parseFloat(entry.hours).toFixed(2) or 0
            data(entries)
        )
    )

    request.end()
    request.on("error", fail)

  ### 
    entry 
      hours (int) REQUIRED
      project_id (str) REQUIRED
      task_id (str) REQUIRED
      spent_at (date) REQUIRED
      notes (str) OPTIONAL
  ###
  create: (entry, success, fail) ->

    #console.log "CREATE", entry

    data = JSON.stringify(entry)

    headers = @headers
    headers["Content-Length"] = data.length

    path = "/daily/add"
    options =
      host: @host
      path: path
      headers: @headers
      method: "POST"

    request = HTTPS.request(
      options
      (res) ->
        if res.statusCode isnt 201
          fail()
        else
          chunks = ""
          res.on('data', (chunk) -> chunks += chunk)
          res.on('end', () -> 
              success(JSON.parse(chunks))
          )
    )

    request.write(data)
    request.end()
    request.on("error", fail)

  ### 
    entry
      hours (int) REQUIRED
      project_id (str) REQUIRED
      task_id (str) REQUIRED
      spent_at (date) REQUIRED
      notes (str) OPTIONAL
  ###
  update: (id, entry, success, fail) ->

    data = JSON.stringify(entry)

    headers = @headers
    headers["Content-Length"] = data.length

    path = "/daily/update/#{id}"
    options =
      host: @host
      path: path
      headers: @headers
      method: "POST"

    request = HTTPS.request(
      options
      (res) ->
        fail() if res.statusCode isnt 200
        chunks = ""
        res.on('data', (chunk) -> chunks += chunk)
        res.on('end', () -> 
          if res.statusCode is 200
            success(JSON.parse(chunks))
        )
    )

    request.write(data)
    request.end()
    request.on("error", fail)

  delete: (id, success, fail) ->

    headers = @headers
    headers["Content-Length"] = 0

    path = "/daily/delete/#{id}"
    options =
      host: @host
      path: path
      headers: @headers
      method: "DELETE"

    request = HTTPS.request(
      options
      (res) ->
        fail() if res.statusCode isnt 200
        chunks = ""
        res.on('data', (chunk) -> chunks += chunk)
        res.on('end', () -> 
          if res.statusCode is 200
            success()
          else
            fail(chunks)
        )
    )

    request.end()
    request.on("error", fail)

  isCalendared: (entry) -> entry?.notes?.indexOf("harvested:") >= 0

class Harvester 

  constructor: (@user, @googlepass, @harvestpass, @harvestdomain, @calendar, @range) ->
    @nounInflector = new natural.NounInflector()
    @verbInflector = new natural.PresentVerbInflector()

  noun: (word, n) ->
    if n is 1
      @nounInflector.singularize(word)
    else
      @nounInflector.pluralize(word)

  verb: (word, n) ->
    if n is 1
      @verbInflector.singularize(word)
    else
      @verbInflector.pluralize(word)

  run: (program) ->

    @program = program

    console.log "⬆ Harvest: Authenticating ...".blue
    @harvest = new Harvest(@user, @harvestpass, @harvestdomain, (() => @_0_harvestauthenticated()), (() => @fail("Unable to authenticate with Harvest.")))

  _0_harvestauthenticated: ->
    console.log "✔ Harvest: Authenticated".green 

    if @program.action is "tasks"
      # lists tasks and exit
      @harvest.projectsandtasks(
        ((projects)-> console.log "#{projects.length} projects"),
        ((project, taskassignments) -> 
          for ta in taskassignments
            do (ta) =>
              console.log "#{project.id}\t#{ta.task.id}\t#{project.name}\t#{ta.task.name}"
        ),
        @_N_exit,
        (() => @fail("Could not get tasks from Harvest"))
      )
    else if @program.action is "clear"
      @harvest.entries(
        @range.from, 
        @range.to, 
        ((entries)=>
          for entry in entries when entry?.hours isnt "0.0" and @harvest.isCalendared(entry)
            do (entry) =>
              @harvest.delete(
                entry.id,
                (() -> console.log "✔ Deleted #{entry.id} successfully".green),
                (()=>@fail("Could not delete entry (#{entry.id}) in Harvest"))
              )
        ), 
        (() => @fail("Harvest: Retrieving existing harvest entries failed."))
      )
    else
      console.log "⬆ Google: Authenticating ...".blue
      @cal = new GoogleCalendar(@user, @googlepass, (() => @_1_googleauthenticated()), (() => @fail("Unable to authenticate with Google")))

  _1_googleauthenticated: ->
    console.log "✔ Google: Authenticated".green
    console.log "⬇ Harvest: Harvesting ...".blue

    @harvest.entries(@range.from, @range.to, ((entries)=>@_2_harvestharvested(entries)), (() => @fail("Harvest: Retrieving existing harvest entries failed.")))

  _2_harvestharvested: (entries) ->
    # look for entries which have calendar annotation (in notes)
    @calendaredEntries = (entry for entry in entries when entry?.hours isnt "0.0" and @harvest.isCalendared(entry))

    # annotate all calendared harvest entries with event id
    for entry in @calendaredEntries
      do (entry) ->
        entry.event_id = /harvested:(\S*)/g.exec(entry?.notes)[1]

    console.log "✔ Harvest: Harvested #{entries.length} existing #{@noun("entry",entries.length)}. #{@calendaredEntries.length} #{@verb("are",@calendaredEntries.length)} calendared already.".green

    console.log "⬇ Google: Harvesting ...".blue
    @cal.events({ calendar: @calendar, from: @range.from, to: @range.to }, ((data) => @_3_googleharvested(data)), (() => @fail("Google: Retrieving events failed")))

  _3_googleharvested: (events) ->

    @fail("Google: MaxResults (#{@cal.maxResults}) exceeded, try with a smaller range") if events.length is @cal.maxResults 

    console.log "✔ Google: Harvested #{events.length} #{@noun("event", events.length)}. Now looking for matches.".green

    # 1) go through all @calendaredEntries and find updates and deletes

    known_harvested_event_ids = (entry?.event_id for entry in @calendaredEntries)
    # updated events are all events which are currently in harvest
    updated_events = (event for event in events when event.id in known_harvested_event_ids)
    # deleted events are those which are in harvest but not in calendar
    updated_event_ids = (event.id for event in updated_events)
    deleted_event_ids = _.difference(known_harvested_event_ids, updated_event_ids)
    deletable_harvest_entries = (entry for entry in @calendaredEntries when entry?.event_id in deleted_event_ids)
    updatable_harvest_entries = (entry for entry in @calendaredEntries when entry?.event_id in updated_event_ids)

    event_lookup = _.reduce(events, ((memo, event) -> memo[event.id] = event; memo), {})

    # these must be updated
    updatable_harvest_entries = _.filter(updatable_harvest_entries, 
      (entry) -> 
        calendared_duration_in_hours = event_lookup[entry?.event_id].duration_in_hours
        calendared_date = moment(event_lookup[entry?.event_id].start?.dateTime)
        if entry?.duration_in_hours isnt calendared_duration_in_hours or moment(entry?.spent_at).format("YYYYMMDD") isnt calendared_date.format("YYYYMMDD")
          entry?.new_duration_in_hours = calendared_duration_in_hours
          entry?.new_spent_at = calendared_date
          true
        else
          false
    )

    
    # 2) go through all calendar events and find matches for rules

    # all new events
    new_events = (event for event in events when event.id not in updated_event_ids)

    # all new events matching some rule
    matching_events = _.filter(
      new_events,
      (event) ->
        _.any(
          Program.configuration.mappings,
          (mapping) ->
            _.all(
              mapping.rules,
              (rule) ->
                for property, regex of rule
                  if new RegExp(regex, "i").test(event[property])
                    event.matched_by = mapping
                    return true
                  else
                    return false
            )
        )
    )


    summary = [["Name ","Time ","Duration ","Matched By ","Action "]]

    # CREATES (matches)
    for event in matching_events
      do (event) =>
        summary.push([
          event.summary,
          moment(event.start.dateTime).format("MMMM Do YYYY, H:mm:ss"),
          event.duration_in_hours,
          "#{event.matched_by.name}",
          "ADD".green + " #{event.matched_by.project_id} #{event.matched_by.task_id}"
        ])

    # DELETES
    _.each(
      _.map(
        deletable_harvest_entries,
        (entry) ->
          [
            "Harvest Task ##{entry.id}".italic,
            moment(entry.spent_at).format("MMMM Do YYYY, H:mm:ss"),
            entry.duration_in_hours,
            "N/A".italic,
            "DELETE".red + " #{entry.id}"
          ]
      ),
      (line) -> summary.push(line)
    )

    # UPDATES
    _.each(
      _.map(
        updatable_harvest_entries,
        (entry) ->
          [
            "Harvest Task ##{entry.id}".italic,
            moment(entry.spent_at).format("MMMM Do YYYY, H:mm:ss"),
            entry.duration_in_hours,
            "N/A".italic,
            "UPDATE".blue + " #{entry.id}, hours => #{entry.new_duration_in_hours}, spent_at => #{entry.new_spent_at.format("ddd, D MMM YYYY")}"
          ]
      ),
      (line) -> summary.push(line)
    )

    # PRINT SUMMARY
    if summary.length is 1 
      console.log "•" + " Nothing to do. Put more stuff in your calendar and/or create more mappings".grey
      @_N_exit()

    console.log "•" + " A summary of the synchronization is printed below.".grey
    console.log cliff.stringifyRows(summary, ["bold", "bold", "bold", "bold", "bold"])

    ((harvest, updates, deletes, creates) =>
      Prompt.start()
      Prompt.get(
        [{ name: "continue", validator: /^[YyNn]/, message: "Continue and perform changes in Harvest? [Y/N]" }]
        (err, result) =>
          if /[Yy]/.test(result.continue)
            console.log "•" + " Lets do it!".grey
            # let the modifications begin
            for entry in updates
              do (entry) ->
                harvest.update(
                  entry.id,
                  {
                    notes: entry.notes
                    hours: entry.new_duration_in_hours
                    spent_at: entry.new_spent_at.format("ddd, D MMM YYYY")
                  },
                  ((result) => console.log "✔ Updated #{entry.id} successfully".green),
                  (()=>@fail("Could not update entry #{entry?.id} in Harvest"))
                )
            for entry in deletes
              do (entry) ->
                harvest.delete(
                  entry.id,
                  (() -> console.log "✔ Deleted #{entry.id} successfully".green),
                  (()=>@fail("Could not delete entry (#{entry?.id}) in Harvest"))
                )
            for event in creates
              do (event) =>
                harvest.create(
                  {
                    hours: event.duration_in_hours
                    project_id: event.matched_by.project_id
                    task_id: event.matched_by.task_id
                    spent_at: moment(event.start.dateTime).format("ddd, D MMM YYYY")
                    # html encode?
                    notes: "#{escape(event.summary)}, from:#{event.start?.dateTime}, to:#{event.end?.dateTime}, harvested:#{event.id}"
                  },
                  ((result) -> console.log "✔ Created Harvest entry from \"#{event.summary}\" on #{moment(event.start.dateTime).format("ddd, D MMM YYYY")} successfully".green),
                  (()=>@fail("Could not create entry #{entry?.id} - \"#{event?.summary}\" in Harvest"))
                )
          else
            console.log "Ok, nevermind then.".red
            @_N_exit()
      ))(@harvest, updatable_harvest_entries, deletable_harvest_entries, matching_events)


    

    

  _N_exit: -> process.exit(0)

  fail: (msg) -> 
    console.log("✘ #{msg}".red)
    process.exit(1)



# THIS IS WHERE THE ACTION IS

# setup prompt
Prompt.message = "•"
Prompt.delimiter = " "

Prompt.start()

Prompt.get(
  (p for p in [
    if not Program.configuration? 
      { name: "configuration", message: "Please input location of your configuration file. "}
  ] when p?)
  (err, result) ->
    try 
      Program.configuration = require(Program.configuration ? result.configuration).shift()
    catch error
      console.log "✘ Could not find or parse configuration file (#{Program.configuration ? result.configuration})".red
      process.exit(1)

    Prompt.get(
      (p for p in [
        if not Program.user? and not Program.configuration?.user?
          { name: "user", message: "What is your username (exclude @c3a.dk)? " }
        if not (Program.action in ["tasks","clear"]) and not Program.googlepass? and not Program.configuration?.googlepass?
          { name: "googlepass", message: "What is your Google password? ", hidden: true }
        if not Program.harvestpass? and not Program.configuration?.harvestpass?
          { name: "harvestpass", message: "What is your Harvest password? ", hidden: true }
        if not Program.harvestdomain? and not Program.configuration?.domain?
          { name: "harvestdomain", message: "What is your Harvest domain? " }
        if not Program.action? and not Program.calendar? and not Program.configuration?.calendar?
          { name: "calendar", message: "Enter calendar from which to extract events. " }
        if Program.action isnt "tasks" and not Program.range? and not Program.configuration?.range?.from?
          { name: "from", message: "Enter the start date for the search in the form YYYYMMDD. " }
        if Program.action isnt "tasks" and not Program.range? and not Program.configuration?.range?.to?
          { name: "to", message: "Enter the end date for the search in the form YYYYMMDD. " }
      ] when p?)
      (err, result) -> 
  
        harvester = new Harvester(
          Program.user ? Program.configuration?.user ? result.user, 
          Program.googlepass ? Program.configuration?.googlepass ? result.googlepass, 
          Program.harvestpass ? Program.configuration?.harvestpass ? result.harvestpass, 
          Program.harvestdomain ? Program.configuration?.harvestdomain ? result.harvestdomain, 
          Program.calendar ? Program.configuration?.calendar ? result.calendar,
          Program.range ? Program.configuration?.range ? { from: result.from, to: result.to }
        )
        harvester.run(Program)    
    )
)
