'use strict'

/*  SOURCE:
    Map of the Netherlands .JSON from: https://github.com/deldersveld/topojson
    Map functionality based on: http://mapstarter.com
    Brush based on: https://github.com/cmda-fe3/course-17-18/tree/master/site/class-4/brush
    Tooltip based on: https://bl.ocks.org/d3noob/257c360b3650b9f0a52dd8257d7a2d73
    Data by Data Amsterdam: https://open.data.amsterdam.nl/Festivals.csv
*/

/*
    I've decided to use a class based aproach. This allowed me to split the two
    different visualisations into different "modules", improving readability
    and allowing me to make the components reusable may the need arise.
*/
class App {
    constructor(element) {
        this.el = element // The class receives a DOM element to render in.
        this.brushTimeout = null // Used as a central place to store timeouts created by the brush.

        /*
            The bind functions (used in every class) replace the `this` reference
            in the function with the App class reference to `this`.
            This allows me to easily access the class in the scope of an underlying function.
        */
        this.initialize = this.initialize.bind(this)
        this.handleBrush = this.handleBrush.bind(this)

        this.initialize() // Start the initial function
    }

    initialize() {
        this.mapElement = this.createElement('map') // Use a custom function to create a new element
        this.el.appendChild(this.mapElement) // Append the new element to `this.el`

        this.brushElement = this.createElement('brush')
        this.el.appendChild(this.brushElement)

        // Open the data file, process it and continue the application.
        d3.csv('festivals.csv', this.process, (err, data) => {
            this.map = new FestivalMap(this.mapElement, {
                data: data
            }) // Initialize a new FestivalMap class with the newly appended element
            this.brush = new FestivalBrush(this.brushElement, {
                data: data,
                handleBrush: this.handleBrush
            }) // Initialize a new FestivalBrush class and add the `handleBrush` function
        })
    }

    // Here I start to clean the data
    process(d) {
        var parseTime = d3.timeParse("%d-%m-%Y") // Set the expected format of the date indication

        d.Latitude = d.Latitude.replace(',', '.') // Replace European number notation with American
        d.Longitude = d.Longitude.replace(',', '.')

        var base = { // Create a new object containing all data I'm certain to receive
            title: d.TitleEN,
            date: d.CalendarsummaryEN,
            location: d.Locatienaam,
            coordinates: [parseFloat(d.Longitude), parseFloat(d.Latitude)],
        }

        if (d.Datepattern_startdate && d.Datepattern_enddate) {
            // If the event contains a range of dates.
            const start_date = parseTime(d.Datepattern_startdate) // Parse the start date
            const end_date = parseTime(d.Datepattern_enddate) // Same for end date
            let dateArray = [] // Create an empty array
            for (let date = start_date; date <= end_date; date.setDate(date.getDate() + 1)) {
                // Create new date objects for all dates between start and end date
                dateArray.push(date)
            }
            base.dates = dateArray // Store the dates in the base object
        } else if (d.Singledates) {
            // If the event contains seperate dates.
            const dates = d.Singledates.split(',') // Create an array from the string of dates
            let dateArray = dates.map((d) => parseTime(d)) // Parse all dates using the parse function
            base.dates = dateArray // Store the dates in the base object
        }

        // Only return the instance when it contains dates
        if (base.dates.length > 0) {
            return base
        }

        return
    }

    createElement(name) {
        // Because I do this more than once, I created a function that...
        let element = document.createElement('div') // Creates an element
        element.classList.add(name) // Adds value `name` as class to it
        return element // Returns the new element
    }

    // Callback for brush events, passes the data to the map
    handleBrush(value) {
        // Throttle the map rendering to prevent unneeded actions.
        clearTimeout(this.brushTimeout) // Reset timeout every time the brush event is called
        this.brushTimeout = setTimeout(() => {
            this.map.renderEvents(value) // Call the `renderEvents` function in the map with data from the brush
        }, 250) // Sets a timeout of 250ms
    }
}

class FestivalMap {
    constructor(element, options) {
        this.el = element // Store data in the class for later use
        this.data = options.data
        this.dimensions = {
            width: 960,
            height: 540
        }

        // The bind functions replace the `this` reference in the function with the App class reference to `this`.
        this.initialize = this.initialize.bind(this)
        this.renderEvents = this.renderEvents.bind(this)

        this.initialize() // Start the initial function
    }

    initialize() {
        //Create an SVG
        this.svg = d3.select(this.el).append("svg") // Create a new SVG inside the map element
            .attr("width", this.dimensions.width) // Use the width and height set in the constructor
            .attr("height", this.dimensions.height)

        this.tooltip = d3.select(this.el).append("div")
            .attr("class", "tooltip")
            .style("opacity", 0) // Create an invisible div for the tooltip to use

        // Set a map projection that shows a part of the map
        this.projection = d3.geoMercator()
            .scale(81404.25840866912) // Set zoom level
            .center([4.898599286994548, 52.35474990918962]) // Set the center positon
            .translate([
                this.dimensions.width / 2,
                this.dimensions.height / 2
            ]) // Translate to center the map in view

        // Create a path suitable for rendering the topojson file.
        var path = d3.geoPath()
            .projection(this.projection)

        // Create a new element to render the paths (representing counties) in
        this.features = this.svg.append("g")
            .attr("class", "features")

        d3.json("nl.topojson", (error, geodata) => { // Open the TopoJSON file containing the Netherlands
            if (error) return console.log(error)

            // Create a path for each map feature in the data
            // Add it to the `features` element
            this.features.selectAll("path")
                .data(topojson.feature(geodata, geodata.objects.Gemeentegrenzen).features) // generate features from TopoJSON
                .enter()
                .append("path")
                .attr('class', (d) => d.properties.GM_CODE) // Add a class name per path (used for styling later on)
                .attr("d", path)
        })
    }

    // Render dots based on the range (defined by the brush)
    renderEvents(range = null) {
        // Create a new variable for the data, as I'm about to filter it
        // and would rather not change the original
        let data = this.data
        if (range) { // If range is provided
            data = this.data.filter((base) => {
                for (let date of base.dates) {
                    // Only return events that have a date in between the range
                    if (date >= range.start && date <= range.end) return base
                }
                return // Or don't return anything
            })
        }

        this.svg.selectAll("circle")
            .remove() // Remove previously rendered circles

        this.svg.selectAll("circle")
            .data(data).enter()
            .append("circle") // Append a new circle
            .attr("cx", (d) => this.projection(d.coordinates)[0]) // Use the coordinates from the date
            .attr("cy", (d) => this.projection(d.coordinates)[1]) // and use projection to define the position in pixels
            .attr("r", "5px") // Set radius of the circle to 5 pixels
            .on("mouseover", (d) => { // When hovering over a circle
                this.tooltip.transition() // Fade in the tooltip
                    .duration(200)
                    .style("opacity", 1)
                // Create content of the tooltip: Event title, date summary and location.
                this.tooltip.html(`<strong>${d.title}</strong><br/>${d.date.split(',')[0]}<br/>${d.location}`)
                    .style("left", (d3.event.pageX + 4) + "px") // Move the tooltip to the right from the cursor
                    .style("top", (d3.event.pageY - 4) + "px") // Move the tooltip down from the cursor
            })
            .on("mouseout", (d) => { // When hovering out of a circle
                this.tooltip.transition()
                    .duration(500)
                    .style("opacity", 0) // Slowly fade out the tooltip
            })
    }
}

class FestivalBrush {
    constructor(element, options) {
        this.el = element
        this.data = options.data
        this.handleBrush = options.handleBrush
        this.margin = {
            top: 10,
            right: 0,
            bottom: 40,
            left: 0
        }
        this.dimensions = {
            width: 960,
            height: 120
        }

        this.initialize = this.initialize.bind(this)
        this.onload = this.onload.bind(this)
        this.brushed = this.brushed.bind(this)

        this.initialize()
    }

    initialize() {
        //Create an SVG
        this.svg = d3.select(this.el).append("svg")
            .attr("width", this.dimensions.width + this.margin.left + this.margin.right)
            .attr("height", this.dimensions.height + this.margin.top + this.margin.bottom)

        this.onload(this.data)
    }

    onload(data) {
        // Map loops through all objects in the data array and passes the `dates`
        // to the reduce function. Then it combines all `dates` array into one array
        // called `date_array`.
        const date_array = data.map((d) => d.dates).reduce((a, b) => {
            return a.concat(b) // Flatten all dates for usage on the x axis
        }).sort(function (a, b) {
            return a - b // Sort it on date
        })

        // This function creates strings (date) with the amount of festivals per date
        let counts = {} // Create an object to store counts in
        date_array.map((d) => { // Loop through the dates
            if (counts[d]) { // If the date exists in the `counts` object
                counts[d]++ // Increase count for date by one
            } else {
                counts[d] = 1 // Create a new date in the counts object and set it to 1
            }
        })

        let new_data = [] // Create an empty array as not to overwrite the original just yet
        for (let key in counts) {
            new_data.push({
                date: new Date(key), // Revert the key to a real Date object from a string
                count: counts[key] // Find the date from the `counts` object and add the corresponding count
            })
        }
        data = new_data // Overwrite original data object with cleaned version

        // Creates x axis with the scale using the `date_array` created earlier
        this.position = {}
        this.position.x = d3.scaleTime()
            .domain(d3.extent(date_array))
            .range([0, this.dimensions.width]) // Use the width of the svg to calculate positions of the ticks

        this.position.y = d3.scaleLinear() // Create a linear scale to show the counts per date
            .domain([0, d3.max(data, (d) => d.count)]) // Get the highest count from the data
            .range([this.dimensions.height, 0]) // Use the height of the svg to set available room

        this.xAxis = d3.axisBottom(this.position.x)
            .ticks(d3.timeMonth.every(1)) // Add the x axis to the bottom of the chart and set ticks to one per month

        this.area = d3.area() // Create an area chart
            .curve(d3.curveMonotoneX) // Set the curve to add smoothness
            .x((d) => this.position.x(d.date)) // Set the date on the x axis
            .y0(this.dimensions.height) // Set amount of vertical room
            .y1((d) => this.position.y(d.count)) // Set the count on the y axis

        this.context = this.svg.append('g')
            .attr('class', 'context') // The brush will be drawn inside this element

        this.brush = d3.brushX() // Set x axis for the brush to monitor
            .extent([[0, 0], [this.dimensions.width, this.dimensions.height]]) // Configure the amount of room for the brush
            .on('brush end', this.brushed) // Attach an event when the brush no longer moves

        this.context.append('path')
            .datum(data)
            .attr('class', 'area')
            .attr('d', this.area) // Draw the data into the area chart

        this.context.append('g')
            .attr('class', 'axis axis--x')
            .attr('transform', 'translate(0,' + this.dimensions.height + ')')
            .call(this.xAxis) // Add horizontal axis

        this.context.append('g')
            .attr('class', 'brush')
            .call(this.brush) // Add the brush to the context
            .call(this.brush.move, this.position.x.range()) // Register moves of the brush and pass the range
    }

    brushed() {
        // Retreives the start and end position of the brush
        var d = d3.event.selection.map(this.position.x.invert)
        // Passes it to the `handleBrush` function in the App class,
        // which in turn will send it to the map.
        this.handleBrush({
            start: d[0],
            end: d[1]
        })
    }
}

// Start the application in the already rendered div with id `app`
new App(document.getElementById('app'))
