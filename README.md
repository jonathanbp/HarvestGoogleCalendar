# HarvestGoogleCalendar

`v. 0.0.4`

This is a tool for harvesting information from [Google Calendar](http://google.com/calendar) into the [Harvest](http://www.getharvest.com/) time tracking system. The tool basically;

 1. Looks up all your Harvest entries for a given time period
 2. Filters the entries retaining only those where the `notes` field contains a "harvested:<eventid>" string - these are the entries already linked to Google Calendar events.
 3. Looks up all your Google Calendar events for the same time period.
 4. Finds obsolete Harvest entries and new events to insert and prompts the user to perform these updates, deletes or creates of Harvest entries.

The new events are found by matching each event against a set of configurable mappings (described under the "configuration file" section).

## How To Run

Options can either be given as command-line arguments, input into a YAML configuration file or be input when prompted.

	Usage: harvestgoogle [options]

	Options:

    -h, --help                          output usage information
    -V, --version                       output the version number
    -c, --configuration [file]          Location of configuration file.
    -a, --action [action]               Execute action. Available actions are: 'tasks' to show a list of available tasks in Harvest, 'clear' to clear all linked tasks in Harvest. Leave blank to synchronize.
    -u, --user [username]               Google username
    -p, --harvestpass [pass]            Password for Harvest
    -g, --googlepass [pass]             Password for Google
    -c, --calendar [calendar]           Name of Google Calendar
    -r, --range [YYYYMMDD]..[YYYYMMDD]  A timerange 

## Configuration file

The configuration file is a YAML document containing arguments to the process *(optional)* and a set of mappings. Each mapping interpreted as so:

 * *name* gives a name to the mapping,
 * *task_id* indicates which kind of Harvest task to create an entry,
 * *project_id* indicates into which Harvest project the entry should be created,
 * *rules* is a collection of key-value pairs where the key denotes a property on an event, while the value is the regular expression which must be matched by the property

And example could be:

	- name: Breakfasts at Tiffany's
    project_id: 123456
    task_id: 654321
    rules: 
      - summary: "[Bb]reakfast"
      - location: "Tiffany"

Which, when run, will create Harvest entries in with the given task + project corresponding to all events which contain "Breakfast" or "breakfast" in the title (summary) and a location which contains "Tiffany".

## License

The MIT License (MIT)

Copyright (c) 2012 Jonathan Bunde-Pedersen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.