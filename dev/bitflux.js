(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('d3'), require('d3fc'), require('jquery')) :
    typeof define === 'function' && define.amd ? define(['d3', 'd3fc', 'jquery'], factory) :
    (global.bitflux = factory(global.d3,global.fc,global.$));
}(this, function (d3,fc,$) { 'use strict';

    d3 = 'default' in d3 ? d3['default'] : d3;
    fc = 'default' in fc ? fc['default'] : fc;
    $ = 'default' in $ ? $['default'] : $;

    var event = {
        crosshairChange: 'crosshairChange',
        viewChange: 'viewChange',
        newTrade: 'newTrade',
        historicDataLoaded: 'historicDataLoaded',
        historicFeedError: 'historicFeedError',
        streamingFeedError: 'streamingFeedError',
        streamingFeedClose: 'streamingFeedClose',
        dataProductChange: 'dataProductChange',
        dataPeriodChange: 'dataPeriodChange',
        resetToLatest: 'resetToLatest',
        clearAllPrimaryChartIndicatorsAndSecondaryCharts: 'clearAllPrimaryChartIndicatorsAndSecondaryCharts',
        primaryChartSeriesChange: 'primaryChartSeriesChange',
        primaryChartYValueAccessorChange: 'primaryChartYValueAccessorChange',
        primaryChartIndicatorChange: 'primaryChartIndicatorChange',
        secondaryChartChange: 'secondaryChartChange',
        indicatorChange: 'indicatorChange',
        notificationClose: 'notificationClose'
    };

    function legend() {
        var priceFormat;
        var volumeFormat;
        var timeFormat;

        var tooltip = fc.chart.tooltip()
            .items([
                ['T', function(d) { return timeFormat(d.date); }],
                ['O', function(d) { return priceFormat(d.open); }],
                ['H', function(d) { return priceFormat(d.high); }],
                ['L', function(d) { return priceFormat(d.low); }],
                ['C', function(d) { return priceFormat(d.close); }],
                ['V', function(d) { return volumeFormat(d.volume); }]
            ]);

        function legend(selection) {
            selection.each(function(model) {
                var container = d3.select(this);
                var tooltipContainer = container.select('#tooltip');

                priceFormat = model.product.priceFormat;
                volumeFormat = model.product.volumeFormat;
                timeFormat = model.period.timeFormat;

                container.classed('hidden', !model.data);

                tooltipContainer.layout({flexDirection: 'row'})
                    .selectAll('.tooltip')
                    .layout({marginRight: 40, marginLeft: 15});

                if (model.data) {
                    tooltipContainer.datum(model.data)
                        .call(tooltip);
                }
            });
        }

        return legend;
    }

    function centerOnDate(discontinuityProvider, domain, data, centerDate) {
        var dataExtent = fc.util.extent()
            .fields('date')(data);

        var domainExtent = fc.util.extent()
            .fields(fc.util.fn.identity)(domain);

        var domainTimeDifference = discontinuityProvider.distance(domainExtent[0], domainExtent[1]);

        if (centerDate.getTime() < dataExtent[0] || centerDate.getTime() > dataExtent[1]) {
            return domainExtent;
        }

        var centeredDataDomain = [
            discontinuityProvider.offset(centerDate, -domainTimeDifference / 2),
            discontinuityProvider.offset(centerDate, domainTimeDifference / 2)
        ];

        var timeShift = 0;
        if (centeredDataDomain[1].getTime() > dataExtent[1].getTime()) {
            timeShift = -discontinuityProvider.distance(dataExtent[1], centeredDataDomain[1]);
        } else if (centeredDataDomain[0].getTime() < dataExtent[0].getTime()) {
            timeShift = discontinuityProvider.distance(centeredDataDomain[0], dataExtent[0]);
        }

        return [
            discontinuityProvider.offset(centeredDataDomain[0], timeShift),
            discontinuityProvider.offset(centeredDataDomain[1], timeShift)
        ];
    }

    function filterDataInDateRange(domain, data) {
        var startDate = d3.min(domain, function(d) { return d.getTime(); });
        var endDate = d3.max(domain, function(d) { return d.getTime(); });

        var dataSortedByDate = data.sort(function(a, b) {
            return a.date - b.date;
        });

        var bisector = d3.bisector(function(d) { return d.date; });
        var filteredData = data.slice(
          // Pad and clamp the bisector values to ensure extents can be calculated
          Math.max(0, bisector.left(dataSortedByDate, startDate) - 1),
          Math.min(bisector.right(dataSortedByDate, endDate) + 1, dataSortedByDate.length)
        );
        return filteredData;
    }

    function moveToLatest(discontinuityProvider, viewDomainDateExtent, dataDateExtent, ratio) {
        if (arguments.length < 4) {
            ratio = 1;
        }

        // Ensure the earlier data is first in the array
        var sortedViewDomainExtent = fc.util.extent().fields(fc.util.fn.identity)(viewDomainDateExtent);
        var sortedDataExtent = fc.util.extent().fields(fc.util.fn.identity)(dataDateExtent);

        var dataTimeExtent = discontinuityProvider.distance(sortedDataExtent[0], sortedDataExtent[1]);
        var scaledDomainTimeDifference = ratio * discontinuityProvider.distance(sortedViewDomainExtent[0], sortedViewDomainExtent[1]);
        var scaledLiveDataDomain = scaledDomainTimeDifference < dataTimeExtent ?
          [discontinuityProvider.offset(sortedDataExtent[1], -scaledDomainTimeDifference), sortedDataExtent[1]] : sortedDataExtent;
        return scaledLiveDataDomain;
    }

    function trackingLatestData(domain, data) {
        var latestViewedTime = d3.max(domain, function(d) { return d.getTime(); });
        var latestDatumTime = d3.max(data, function(d) { return d.date.getTime(); });
        return latestViewedTime === latestDatumTime;
    }

    var domain = {
        centerOnDate: centerOnDate,
        filterDataInDateRange: filterDataInDateRange,
        moveToLatest: moveToLatest,
        trackingLatestData: trackingLatestData
    };

    var renderedOnce = false;

    function layout(containers, charts) {
        containers.secondaries.style('flex', charts.secondaries().charts().length);
        containers.overlaySecondaries.style('flex', charts.secondaries().charts().length);

        var headRowHeight = parseInt(containers.app.select('.head-row').style('height'), 10);
        if (!renderedOnce) {
            headRowHeight +=
              parseInt(containers.app.select('.head-row').style('padding-top'), 10) +
              parseInt(containers.app.select('.head-row').style('padding-bottom'), 10) +
              parseInt(containers.app.select('.head-row').style('margin-bottom'), 10);
            renderedOnce = true;
        }

        var useableHeight = fc.util.innerDimensions(containers.app.node()).height - headRowHeight;

        containers.chartsAndOverlay.style('height', useableHeight + 'px');

        charts.xAxis().dimensionChanged(containers.xAxis);
        charts.nav().dimensionChanged(containers.navbar);
        charts.primary().dimensionChanged(containers.primary);
        charts.secondaries().charts().forEach(function(chart) {
            chart.option.dimensionChanged(containers.secondaries);
        });
    }

    var id = 0;
    function uid() {
        return ++id;
    }

    function width(element) {
        return $(element).width();
    }

    // Inspired by underscore library implementation of debounce

    function debounce(func, wait, immediate) {
        var timeout;
        var args;
        var timestamp;
        var result;

        var later = function() {
            var last = new Date().getTime() - timestamp;

            if (last < wait && last >= 0) {
                timeout = setTimeout(later.bind(this), wait - last);
            } else {
                timeout = null;
                if (!immediate) {
                    result = func.apply(this, args);
                    args = null;
                }
            }
        };

        return function() {
            args = arguments;
            timestamp = new Date().getTime();
            var callNow = immediate && !timeout;

            if (!timeout) {
                timeout = setTimeout(later.bind(this), wait);
            }
            if (callNow) {
                result = func.apply(this, args);
                args = null;
            }

            return result;
        };
    }

    // Inspired by underscore library implementation of throttle

    function throttle(func, wait, options) {
        var args;
        var result;
        var timeout = null;
        var previous = 0;

        if (!options) {
            options = {};
        }

        var later = function() {
            if (options.leading === false) {
                previous = 0;
            } else {
                previous = new Date().getTime();
            }

            timeout = null;
            result = func.apply(this, args);

            if (!timeout) {
                args = null;
            }
        };

        return function() {
            var now = new Date().getTime();

            if (!previous && options.leading === false) {
                previous = now;
            }

            var remaining = wait - (now - previous);
            args = arguments;

            if (remaining <= 0 || remaining > wait) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                previous = now;
                result = func.apply(this, args);

                if (!timeout) {
                    args = null;
                }
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later.bind(this), remaining);
            }

            return result;
        };
    }

    var util = {
        domain: domain,
        layout: layout,
        uid: uid,
        width: width,
        debounce: debounce,
        throttle: throttle
    };

    function zoomBehavior(width) {

        var dispatch = d3.dispatch('zoom');

        var zoomBehavior = d3.behavior.zoom();
        var scale;
        var discontinuityProvider;
        var dataDateExtent;

        var allowPan = true;
        var allowZoom = true;
        var trackingLatest = true;

        function controlZoom(zoomExtent) {
            // If zooming, and about to pan off screen, do nothing
            return (zoomExtent[0] > 0 && zoomExtent[1] < 0);
        }

        function resetBehaviour() {
            zoomBehavior.translate([0, 0]);
            zoomBehavior.scale(1);
        }

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function clampDomain(domain, totalXExtent) {
            var clampedDomain = domain;

            if (scale(dataDateExtent[0]) > 0) {
                clampedDomain[1] = scale.invert(scale(domain[1]) + scale(dataDateExtent[0]));
            }

            clampedDomain[0] = d3.max([totalXExtent[0], clampedDomain[0]]);
            clampedDomain[1] = d3.min([totalXExtent[1], clampedDomain[1]]);

            return clampedDomain;
        }

        function zoom(selection) {
            var min = scale(dataDateExtent[0]);
            var max = scale(dataDateExtent[1]);
            var zoomPixelExtent = [min, max - width];

            zoomBehavior.x(scale)
              .on('zoom', function() {
                  var t = d3.event.translate,
                      tx = t[0];

                  var maxDomainViewed = controlZoom(zoomPixelExtent);

                  tx = clamp(tx, -zoomPixelExtent[1], -zoomPixelExtent[0]);
                  zoomBehavior.translate([tx, 0]);

                  var panned = (zoomBehavior.scale() === 1);
                  var zoomed = (zoomBehavior.scale() !== 1);

                  if ((panned && allowPan) || (zoomed && allowZoom)) {
                      var domain = scale.domain();
                      if (maxDomainViewed) {
                          domain = dataDateExtent;
                      } else if (zoomed && trackingLatest) {
                          domain = util.domain.moveToLatest(discontinuityProvider, domain, dataDateExtent);
                      }

                      domain = clampDomain(domain, dataDateExtent);

                      if (domain[0].getTime() !== domain[1].getTime()) {
                          dispatch.zoom(domain);
                      } else {
                          // Ensure the user can't zoom-in infinitely, causing the chart to fail to render
                          // #168, #411
                          resetBehaviour();
                      }
                  } else {
                      resetBehaviour();
                  }
              });

            selection.call(zoomBehavior)
                .on('dblclick.zoom', null);
        }

        zoom.allowPan = function(x) {
            if (!arguments.length) {
                return allowPan;
            }
            allowPan = x;
            return zoom;
        };

        zoom.allowZoom = function(x) {
            if (!arguments.length) {
                return allowZoom;
            }
            allowZoom = x;
            return zoom;
        };

        zoom.trackingLatest = function(x) {
            if (!arguments.length) {
                return trackingLatest;
            }
            trackingLatest = x;
            return zoom;
        };

        zoom.scale = function(x) {
            if (!arguments.length) {
                return scale;
            }
            scale = x;
            return zoom;
        };

        zoom.discontinuityProvider = function(x) {
            if (!arguments.length) {
                return discontinuityProvider;
            }
            discontinuityProvider = x;
            return zoom;
        };

        zoom.dataDateExtent = function(x) {
            if (!arguments.length) {
                return dataDateExtent;
            }
            dataDateExtent = x;
            return zoom;
        };

        d3.rebind(zoom, dispatch, 'on');

        return zoom;
    }

    function nav() {
        var navHeight = 100; // Also maintain in variables.less
        var bottomMargin = 40; // Also maintain in variables.less
        var navChartHeight = navHeight - bottomMargin;
        var borderWidth = 1; // Also maintain in variables.less
        var extentHeight = navChartHeight - borderWidth;
        var barHeight = extentHeight;
        var handleCircleCenter = borderWidth + barHeight / 2;
        var handleBarWidth = 2;
        var yExtentPadding = [0, 0.04];
        var numberOfSamples = 200;

        var dispatch = d3.dispatch(event.viewChange);
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();

        var navChart = fc.chart.cartesian(xScale, yScale)
            .yTicks(0)
            .margin({
                bottom: bottomMargin      // Variable also in navigator.less - should be used once ported to flex
            })
            .xOuterTickSize(0)
            .yOuterTickSize(0);

        var viewScale = fc.scale.dateTime();

        var area = fc.series.area()
            .xValue(function(d) { return d.date; })
            .y1Value(function(d) { return d.close; })
            .y0Value(function() { return yScale.domain()[0]; });

        var line = fc.series.line()
            .xValue(function(d) { return d.date; })
            .yValue(function(d) { return d.close; });
        var brush = d3.svg.brush();
        var navMulti = fc.series.multi()
            .series([area, line, brush])
            .decorate(function(selection) {
                var enter = selection.enter();

                selection.selectAll('.background, .extent')
                    .attr('height', extentHeight)
                    .attr('y', borderWidth);

                // overload d3 styling for the brush handles
                // as Firefox does not react properly to setting these through less file.
                enter.selectAll('.resize.w>rect, .resize.e>rect')
                    .attr('width', handleBarWidth)
                    .attr('x', -handleBarWidth / 2);
                selection.selectAll('.resize.w>rect, .resize.e>rect')
                    .attr('height', barHeight)
                    .attr('y', borderWidth);
                enter.select('.extent')
                    .attr('mask', 'url("#brush-mask")');

                // Adds the handles to the brush sides
                var handles = enter.selectAll('.e, .w');
                handles.append('circle')
                    .attr('cy', handleCircleCenter)
                    .attr('r', 7)
                    .attr('class', 'outer-handle');
                handles.append('circle')
                    .attr('cy', handleCircleCenter)
                    .attr('r', 4)
                    .attr('class', 'inner-handle');
            })
            .mapping(function(series) {
                if (series === brush) {
                    brush.y(null)
                        .extent(viewScale.domain());
                    return null;
                } else {
                    // This stops the brush data being overwritten by the point data
                    return this.data;
                }
            });

        var brushMask = fc.series.area()
            .xValue(function(d) { return d.date; })
            .y1Value(function(d) { return d.close; })
            .y0Value(function() { return yScale.domain()[0]; })
            .decorate(function(selection) {
                selection.enter().attr('fill', 'url("#brush-gradient")');
            });

        var brushLine = fc.series.line()
            .xValue(function(d) { return d.date; })
            .yValue(function(d) { return d.close; });

        var layoutWidth;

        var sampler = fc.data.sampler.largestTriangleThreeBucket()
            .x(function(d) { return xScale(d.date); })
            .y(function(d) { return yScale(d.close); });

        var brushMaskMulti = fc.series.multi()
            .series([brushMask, brushLine])
            .xScale(xScale)
            .yScale(yScale);

        function setHide(selection, brushHide) {
            selection.select('.plot-area')
                .selectAll('.e, .w')
                .classed('hidden', brushHide);
        }

        function xEmpty(navBrush) {
            return (navBrush.extent()[0] - navBrush.extent()[1]) === 0;
        }

        function createDefs(selection, data) {
            var defsEnter = selection.selectAll('defs')
                .data([0])
                .enter()
                .append('defs');

            defsEnter.html('<linearGradient id="brush-gradient" x1="0" x2="0" y1="0" y2="1"> \
              <stop offset="0%" class="brush-gradient-top" /> \
              <stop offset="100%" class="brush-gradient-bottom" /> \
          </linearGradient> \
          <mask id="brush-mask"> \
              <rect class="mask-background"></rect> \
          </mask>');

            selection.select('.mask-background').attr({
                width: layoutWidth,
                height: navChartHeight
            });

            xScale.domain(fc.util.extent().fields('date')(data));
            yScale.domain(fc.util.extent().fields(['low', 'high']).pad(yExtentPadding)(data));

            selection.select('mask')
                .datum(data)
                .call(brushMaskMulti);
        }

        function nav(selection) {
            var model = selection.datum();

            sampler.bucketSize(Math.max(model.data.length / numberOfSamples, 1));
            var sampledData = sampler(model.data);

            xScale.discontinuityProvider(model.discontinuityProvider);
            viewScale.discontinuityProvider(model.discontinuityProvider);

            createDefs(selection, sampledData);

            viewScale.domain(model.viewDomain);

            var filteredData = util.domain.filterDataInDateRange(
                fc.util.extent().fields('date')(sampledData),
                sampledData);
            var yExtent = fc.util.extent()
                .fields(['low', 'high']).pad(yExtentPadding)(filteredData);

            navChart.xDomain(fc.util.extent().fields('date')(sampledData))
                .yDomain(yExtent);

            brush.on('brush', function() {
                var brushExtentIsEmpty = xEmpty(brush);

                // Hide the bar if the extent is empty
                setHide(selection, brushExtentIsEmpty);

                if (!brushExtentIsEmpty) {
                    dispatch[event.viewChange](brush.extent());
                }
            })
            .on('brushend', function() {
                var brushExtentIsEmpty = xEmpty(brush);
                setHide(selection, false);
                if (brushExtentIsEmpty) {
                    dispatch[event.viewChange](util.domain.centerOnDate(
                        model.discontinuityProvider,
                        viewScale.domain(),
                        model.data,
                        brush.extent()[0]));
                }
            });

            navChart.plotArea(navMulti);

            selection.datum({data: sampledData})
                .call(navChart);

            // Allow to zoom using mouse, but disable panning
            var zoom = zoomBehavior(layoutWidth)
                .scale(viewScale)
                .trackingLatest(model.trackingLatest)
                .discontinuityProvider(model.discontinuityProvider)
                .dataDateExtent(fc.util.extent().fields('date')(model.data))
                .allowPan(false)
                .on('zoom', function(domain) {
                    dispatch[event.viewChange](domain);
                });

            selection.select('.plot-area')
                .call(zoom);
        }

        d3.rebind(nav, dispatch, 'on');

        nav.dimensionChanged = function(container) {
            layoutWidth = util.width(container.node());
            viewScale.range([0, layoutWidth]);
            xScale.range([0, layoutWidth]);
            yScale.range([navChartHeight, 0]);
        };

        return nav;
    }

    function calculateCloseAxisTagPath(width, height) {
        var h2 = height / 2;
        return [
            [0, 0],
            [h2, -h2],
            [width, -h2],
            [width, h2],
            [h2, h2],
            [0, 0]
        ];
    }

    function produceAnnotatedTickValues(scale, annotation) {
        var annotatedTickValues = scale.ticks.apply(scale, []);

        var extent = scale.domain();
        for (var i = 0; i < annotation.length; i++) {
            if (annotation[i] > extent[0] && annotation[i] < extent[1]) {
                annotatedTickValues.push(annotation[i]);
            }
        }
        return annotatedTickValues;
    }

    function getExtentAccessors(multiSeries) {
        return multiSeries.reduce(function(extentAccessors, series) {
            if (series.extentAccessor) {
                return extentAccessors.concat(series.extentAccessor);
            } else {
                return extentAccessors;
            }
        }, []);
    }

    function primary() {

        var yAxisWidth = 60;
        var dispatch = d3.dispatch(event.viewChange, event.crosshairChange);

        var currentSeries;
        var currentYValueAccessor = function(d) { return d.close; };
        var currentIndicators = [];
        var zoomWidth;

        var crosshairData = [];
        var crosshair = fc.tool.crosshair()
          .xLabel('')
          .yLabel('')
          .on('trackingmove', function(updatedCrosshairData) {
              if (updatedCrosshairData.length > 0) {
                  dispatch.crosshairChange(updatedCrosshairData[0].datum);
              } else {
                  dispatch.crosshairChange(undefined);
              }
          })
          .on('trackingend', function() {
              dispatch.crosshairChange(undefined);
          });
        crosshair.id = util.uid();

        var gridlines = fc.annotation.gridline()
          .xTicks(0);
        var closeLine = fc.annotation.line()
          .orient('horizontal')
          .value(currentYValueAccessor)
          .label('')
          .decorate(function(g) {
              g.classed('close-line', true);
          });
        closeLine.id = util.uid();

        var multi = fc.series.multi()
            .key(function(series) { return series.id; })
            .mapping(function(series) {
                switch (series) {
                case closeLine:
                    return [this.data[this.data.length - 1]];
                case crosshair:
                    return crosshairData;
                default:
                    return this.visibleData;
                }
            })
            .decorate(function(selection) {
                selection.enter()
                    .select('.area')
                    .attr('fill', 'url("#primary-area-series-gradient")');
            });

        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();

        var primaryChart = fc.chart.cartesian(xScale, yScale)
          .xTicks(0)
          .yOrient('right')
          .margin({
              top: 0,
              left: 0,
              bottom: 0,
              right: yAxisWidth
          })
          .decorate(function(selection) {
              selection.enter()
                  .selectAll('defs')
                  .data([0])
                  .enter()
                  .append('defs')
                  .html('<linearGradient id="primary-area-series-gradient" x1="0%" x2="0%" y1="0%" y2="100%"> \
                      <stop offset="0%" class="primary-area-series-gradient-top" /> \
                      <stop offset="100%" class="primary-area-series-gradient-bottom" /> \
                  </linearGradient>');
          });

        // Create and apply the Moving Average
        var movingAverage = fc.indicator.algorithm.movingAverage();
        var bollingerAlgorithm = fc.indicator.algorithm.bollingerBands();

        function updateMultiSeries() {
            var baseChart = [gridlines, currentSeries.option, closeLine];
            var indicators = currentIndicators.map(function(indicator) { return indicator.option; });
            return baseChart.concat(indicators, crosshair);
        }

        function updateYValueAccessorUsed() {
            movingAverage.value(currentYValueAccessor);
            bollingerAlgorithm.value(currentYValueAccessor);
            closeLine.value(currentYValueAccessor);
            switch (currentSeries.valueString) {
            case 'line':
            case 'point':
                currentSeries.option.yValue(currentYValueAccessor);
                break;
            case 'area':
                currentSeries.option.yValue(currentYValueAccessor);
                currentSeries.option.y0Value(function() { return yScale.domain()[0]; });
                break;
            default:
                break;
            }
        }

        // Call when what to display on the chart is modified (ie series, options)
        function selectorsChanged(model) {
            currentSeries = model.series;
            currentYValueAccessor = model.yValueAccessor.option;
            currentIndicators = model.indicators;
            updateYValueAccessorUsed();
            multi.series(updateMultiSeries());
            primaryChart.yTickFormat(model.product.priceFormat);
            model.selectorsChanged = false;
        }

        function bandCrosshair(data) {
            var width = currentSeries.option.width(data);

            crosshair.decorate(function(selection) {
                selection.classed('band', true);

                selection.selectAll('.vertical > line')
                  .style('stroke-width', width);
            });
        }

        function lineCrosshair(selection) {
            selection.classed('band', false)
                .selectAll('line')
                .style('stroke-width', null);
        }
        function updateCrosshairDecorate(data) {
            if (currentSeries.valueString === 'candlestick' || currentSeries.valueString === 'ohlc') {
                bandCrosshair(data);
            } else {
                crosshair.decorate(lineCrosshair);
            }
        }

        function primary(selection) {
            var model = selection.datum();

            if (model.selectorsChanged) {
                selectorsChanged(model);
            }

            primaryChart.xDomain(model.viewDomain);

            xScale.discontinuityProvider(model.discontinuityProvider);

            crosshair.snap(fc.util.seriesPointSnapXOnly(currentSeries.option, model.visibleData));
            updateCrosshairDecorate(model.visibleData);

            movingAverage(model.data);
            bollingerAlgorithm(model.data);

            // Scale y axis
            // Add percentage padding either side of extreme high/lows
            var extentAccessors = getExtentAccessors(multi.series());
            var paddedYExtent = fc.util.extent()
                .fields(extentAccessors)
                .pad(0.08)(model.visibleData);
            primaryChart.yDomain(paddedYExtent);

            // Find current tick values and add close price to this list, then set it explicitly below
            var latestPrice = currentYValueAccessor(model.data[model.data.length - 1]);
            var tickValuesWithAnnotations = produceAnnotatedTickValues(yScale, [latestPrice]);
            primaryChart.yTickValues(tickValuesWithAnnotations)
              .yDecorate(function(s) {
                  var closePriceTick = s.selectAll('.tick')
                    .filter(function(d) { return d === latestPrice; })
                    .classed('close-line', true);

                  var calloutHeight = 18;
                  closePriceTick.select('path')
                    .attr('d', function() {
                        return d3.svg.area()(calculateCloseAxisTagPath(yAxisWidth, calloutHeight));
                    });
                  closePriceTick.select('text')
                    .attr('transform', 'translate(' + calloutHeight / 2 + ',1)');
              });

            var tickValuesWithoutAnnotations = yScale.ticks.apply(yScale, []);
            gridlines.yTickValues(tickValuesWithoutAnnotations);

            // Redraw
            primaryChart.plotArea(multi);
            selection.call(primaryChart);

            var zoom = zoomBehavior(zoomWidth)
              .scale(xScale)
              .trackingLatest(model.trackingLatest)
              .discontinuityProvider(model.discontinuityProvider)
              .dataDateExtent(fc.util.extent().fields('date')(model.data))
              .on('zoom', function(domain) {
                  dispatch[event.viewChange](domain);
              });

            selection.select('.plot-area')
              .call(zoom);
        }

        d3.rebind(primary, dispatch, 'on');

        // Call when the main layout is modified
        primary.dimensionChanged = function(container) {
            zoomWidth = util.width(container.node()) - yAxisWidth;
        };

        return primary;
    }

    function multiChart() {
        var charts = [];
        var dispatch = d3.dispatch(event.viewChange);

        function key(d) { return d.option.id; }

        var secDataJoin = fc.util.dataJoin()
            .children(true)
            .selector('.secondary-container')
            .element('svg')
            .attr('class', function(d) {
                return 'secondary-container secondary-' + d.valueString;
            })
            .key(function(d) {
                // Issue with elements being regenerated due to data being overwritten. See:
                // https://github.com/ScottLogic/d3fc/blob/0327890d48c9de73a41d901df02bac88dc83e398/src/series/multi.js#L26-L36
                return key(this.__secondaryChart__ || d);
            });

        function multiChart(selection) {
            selection.each(function(model) {
                var secondaries = secDataJoin(this, charts);

                secondaries.each(function(indicator) {
                    this.__secondaryChart__ = indicator;

                    indicator.option.on(event.viewChange, dispatch[event.viewChange]);

                    d3.select(this)
                        .datum(model)
                        .call(indicator.option);
                });
            });
        }

        multiChart.charts = function(x) {
            if (!arguments.length) {
                return charts;
            }
            charts = x;
            return multiChart;
        };

        d3.rebind(multiChart, dispatch, 'on');

        return multiChart;
    }

    function xAxis() {
        var xScale = fc.scale.dateTime();

        var xAxis = d3.svg.axis()
          .scale(xScale)
          .orient('bottom');

        function preventTicksMoreFrequentThanPeriod(period) {
            var scaleTickSeconds = (xScale.ticks()[1] - xScale.ticks()[0]) / 1000;
            if (scaleTickSeconds < period.seconds) {
                xAxis.ticks(period.d3TimeInterval.unit, period.d3TimeInterval.value);
            } else {
                xAxis.ticks(6);
            }
        }

        function xAxisChart(selection) {
            var model = selection.datum();
            xScale.domain(model.viewDomain);

            xScale.discontinuityProvider(model.discontinuityProvider);

            preventTicksMoreFrequentThanPeriod(model.period);
            selection.call(xAxis);
        }

        xAxisChart.dimensionChanged = function(container) {
            xScale.range([0, util.width(container.node())]);
        };

        return xAxisChart;
    }

    function group() {
        var dispatch = d3.dispatch(event.viewChange, event.crosshairChange);

        var legend$$ = legend();

        var nav$$ = nav()
            .on(event.viewChange, dispatch[event.viewChange]);

        var primary$$ = primary()
            .on(event.viewChange, dispatch[event.viewChange])
            .on(event.crosshairChange, dispatch[event.crosshairChange]);

        var secondaryCharts = multiChart()
            .on(event.viewChange, dispatch[event.viewChange]);

        var xAxis$$ = xAxis();

        function group(selection) {
            selection.each(function(model) {
                selection.select('#legend')
                    .datum(model.legend)
                    .call(legend$$);

                selection.select('#navbar-container')
                    .datum(model.nav)
                    .call(nav$$);

                selection.select('#primary-container')
                    .datum(model.primary)
                    .call(primary$$);

                selection.select('#secondaries-container')
                    .datum(model.secondary)
                    .call(secondaryCharts);

                selection.select('#x-axis-container')
                    .datum(model.xAxis)
                    .call(xAxis$$);
            });
        }

        group.legend = function() {
            return legend$$;
        };

        group.nav = function() {
            return nav$$;
        };

        group.primary = function() {
            return primary$$;
        };

        group.secondaries = function() {
            return secondaryCharts;
        };

        group.xAxis = function() {
            return xAxis$$;
        };

        d3.rebind(group, dispatch, 'on');

        return group;
    }

    function productAdaptor(product) {
        return {
            displayString: product.display,
            option: product
        };
    }

    function periodAdaptor(period) {
        return {
            displayString: period.display,
            option: period
        };
    }

    function dropdown() {
        var dispatch = d3.dispatch('optionChange');

        var buttonDataJoin = fc.util.dataJoin()
            .selector('button')
            .element('button')
            .attr({
                'class': 'dropdown-toggle',
                'type': 'button',
                'data-toggle': 'dropdown'
            });

        var caretDataJoin = fc.util.dataJoin()
            .selector('.caret')
            .element('span')
            .attr('class', 'caret');

        var listDataJoin = fc.util.dataJoin()
            .selector('ul')
            .element('ul')
            .attr('class', 'dropdown-menu');

        var listItemsDataJoin = fc.util.dataJoin()
            .selector('li')
            .element('li')
            .key(function(d) { return d.displayString; });

        function dropdown(selection) {
            var model = selection.datum();
            var selectedIndex = model.selectedIndex || 0;
            var config = model.config;

            var button = buttonDataJoin(selection, [model.options]);

            if (config.icon) {
                var dropdownButtonIcon = button.selectAll('.icon')
                    .data([0]);
                dropdownButtonIcon.enter()
                    .append('span');
                dropdownButtonIcon.attr('class', 'icon ' + model.options[selectedIndex].icon);
            } else {
                button.select('.icon').remove();
                button.text(function() {
                    return config.title || model.options[selectedIndex].displayString;
                });
            }

            caretDataJoin(button, config.careted ? [0] : []);

            var list = listDataJoin(selection, [model.options]);

            var listItems = listItemsDataJoin(list, model.options);
            var listItemAnchors = listItems.enter()
                .on('click', dispatch.optionChange)
                .append('a')
                .attr('href', '#');

            listItemAnchors.append('span')
                .attr('class', 'icon');
            listItemAnchors.append('span')
                .attr('class', 'name');

            listItems.classed('selected', function(d, i) {
                return model.selectedIndexes ? model.selectedIndexes.indexOf(i) > -1 : i === selectedIndex;
            });

            listItems.selectAll('.icon')
                .attr('class', function(d) { return 'icon ' + d.icon; });
            listItems.selectAll('.name')
                .text(function(d) { return d.displayString; });
        }

        d3.rebind(dropdown, dispatch, 'on');

        return dropdown;
    }

    function tabGroup() {
        var dispatch = d3.dispatch('tabClick');
        var dataJoin = fc.util.dataJoin()
          .selector('ul')
          .element('ul');

        function tabGroup(selection) {
            var selectedIndex = selection.datum().selectedIndex || 0;

            var ul = dataJoin(selection, [selection.datum().options]);

            ul.enter()
                .append('ul');

            var li = ul.selectAll('li')
                .data(fc.util.fn.identity);

            li.enter()
                .append('li')
                .append('a')
                .attr('href', '#')
                .on('click', dispatch.tabClick);

            li.classed('active', function(d, i) { return i === selectedIndex; })
                .select('a')
                .text(function(option) { return option.displayString; });

            li.exit()
                .remove();
        }

        d3.rebind(tabGroup, dispatch, 'on');
        return tabGroup;
    }

    function head() {

        var dispatch = d3.dispatch(
            event.dataProductChange,
            event.dataPeriodChange,
            event.clearAllPrimaryChartIndicatorsAndSecondaryCharts);

        var dataProductDropdown = dropdown()
            .on('optionChange', dispatch[event.dataProductChange]);

        var dataPeriodSelector = tabGroup()
            .on('tabClick', dispatch[event.dataPeriodChange]);

        var dropdownPeriodSelector = dropdown()
            .on('optionChange', dispatch[event.dataPeriodChange]);

        var head = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var products = model.products;

                container.select('#product-dropdown')
                    .datum({
                        config: model.productConfig,
                        options: products.map(productAdaptor),
                        selectedIndex: products.map(function(p) { return p.id; }).indexOf(model.selectedProduct.id)
                    })
                    .call(dataProductDropdown);

                var periods = model.selectedProduct.periods;
                container.select('#period-selector')
                    .classed('hidden', periods.length <= 1) // TODO: get from model instead?
                    .datum({
                        options: periods.map(periodAdaptor),
                        selectedIndex: periods.indexOf(model.selectedPeriod)
                    })
                    .call(dataPeriodSelector);

                container.select('#mobile-period-selector')
                    .classed('hidden', periods.length <= 1)
                    .datum({
                        config: model.mobilePeriodConfig,
                        options: periods.map(periodAdaptor),
                        selectedIndex: periods.indexOf(model.selectedPeriod)
                    })
                    .call(dropdownPeriodSelector);

                container.select('#clear-indicators')
                    .on('click', dispatch[event.clearAllPrimaryChartIndicatorsAndSecondaryCharts]);
            });
        };

        d3.rebind(head, dispatch, 'on');

        return head;
    }

    function selectors() {
        var dispatch = d3.dispatch(
            event.primaryChartSeriesChange,
            event.primaryChartIndicatorChange,
            event.secondaryChartChange);

        var primaryChartSeriesButtons = dropdown()
            .on('optionChange', dispatch[event.primaryChartSeriesChange]);

        var indicatorToggle = dropdown()
            .on('optionChange', function(indicator) {
                if (indicator.isPrimary) {
                    dispatch[event.primaryChartIndicatorChange](indicator);
                } else {
                    dispatch[event.secondaryChartChange](indicator);
                }
            });

        var selectors = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var selectedSeriesIndex = model.seriesSelector.options.map(function(option) {
                    return option.isSelected;
                }).indexOf(true);

                container.select('.series-dropdown')
                    .datum({
                        config: model.seriesSelector.config,
                        options: model.seriesSelector.options,
                        selectedIndex: selectedSeriesIndex
                    })
                    .call(primaryChartSeriesButtons);

                var options = model.indicatorSelector.options;

                var selectedIndicatorIndexes = options
                    .reduce(function(selectedIndexes, option, index) {
                        return option.isSelected ? selectedIndexes.concat(index) : selectedIndexes;
                    }, []);

                container.select('.indicator-dropdown')
                    .datum({
                        config: model.indicatorSelector.config,
                        options: options,
                        selectedIndexes: selectedIndicatorIndexes
                    })
                    .call(indicatorToggle);

            });
        };

        d3.rebind(selectors, dispatch, 'on');

        return selectors;
    }

    function navigationReset() {

        var dispatch = d3.dispatch(event.resetToLatest);

        function navReset(selection) {
            var model = selection.datum();

            var resetButtonGroup = selection.selectAll('g')
                .data([model]);

            var resetButtonGroupEnter = resetButtonGroup.enter()
                .append('g')
                .attr('class', 'reset-button')
                .on('click', dispatch[event.resetToLatest]);

            resetButtonGroupEnter.append('path')
                .attr('d', 'M1.5 1.5h13.438L23 20.218 14.937 38H1.5l9.406-17.782L1.5 1.5z');

            resetButtonGroupEnter.append('rect')
                .attr({
                    width: 5,
                    height: 28,
                    x: 26,
                    y: 6
                });

            resetButtonGroup.classed('hidden', model.trackingLatest);
        }

        d3.rebind(navReset, dispatch, 'on');

        return navReset;
    }

    function editIndicatorGroup() {
        var dispatch = d3.dispatch(event.indicatorChange);

        function editIndicatorGroup(selection) {
            selection.each(function(model) {
                var sel = d3.select(this);

                var div = sel.selectAll('div')
                    .data(model.selectedIndicators, function(d) {
                        return d.valueString;
                    });

                var containersEnter = div.enter()
                    .append('div')
                    .attr('class', 'edit-indicator');

                containersEnter.append('span')
                    .attr('class', 'icon bf-icon-delete')
                    .on('click', dispatch.indicatorChange);

                containersEnter.append('span')
                    .attr('class', 'indicator-label')
                    .text(function(d) {
                        return d.displayString;
                    });

                div.exit()
                    .remove();
            });
        }

        d3.rebind(editIndicatorGroup, dispatch, 'on');

        return editIndicatorGroup;

    }

    function overlay() {
        var dispatch = d3.dispatch(
            event.primaryChartIndicatorChange,
            event.secondaryChartChange,
            event.dataProductChange);

        var primaryChartIndicatorToggle = editIndicatorGroup()
            .on(event.indicatorChange, dispatch[event.primaryChartIndicatorChange]);

        var secondaryChartToggle = editIndicatorGroup()
            .on(event.indicatorChange, dispatch[event.secondaryChartChange]);

        var dataProductDropdown = dropdown()
            .on('optionChange', dispatch[event.dataProductChange]);

        var secondariesDataJoin = fc.util.dataJoin()
            .selector('.overlay-secondary-container')
            .element('div')
            .attr('class', 'overlay-secondary-container')
            .key(function(d) { return d.displayString;});

        var overlay = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var products = model.products;

                container.select('#mobile-product-dropdown')
                    .datum({
                        config: model.productConfig,
                        options: products.map(productAdaptor),
                        selectedIndex: products.map(function(p) { return p.id; }).indexOf(model.selectedProduct.id)
                    })
                    .call(dataProductDropdown);

                container.select('#overlay-primary-container .edit-indicator-container')
                    .datum({selectedIndicators: model.primaryIndicators})
                    .call(primaryChartIndicatorToggle);

                var secondariesContainer = container.select('#overlay-secondaries-container');

                var secondaries = secondariesDataJoin(secondariesContainer, model.secondaryIndicators);

                var editIndicatorContainer = secondaries.enter()
                    .append('div')
                    .attr('class', 'edit-indicator-container');

                editIndicatorContainer.each(function(d) {
                    d3.select(this).datum({selectedIndicators: [d]}).call(secondaryChartToggle);
                });
            });
        };

        d3.rebind(overlay, dispatch, 'on');

        return overlay;
    }

    var menu = {
        head: head,
        selectors: selectors,
        navigationReset: navigationReset,
        overlay: overlay
    };

    function callbackInvalidator() {
        var n = 0;

        function callbackInvalidator(callback) {
            var id = ++n;
            return function(err, data) {
                if (id < n) { return; }
                callback(err, data);
            };
        }

        callbackInvalidator.invalidateCallback = function() {
            n++;
            return callbackInvalidator;
        };

        return callbackInvalidator;
    }

    function collectOhlc() {

        var date = function(d) { return d.date; };
        var volume = function(d) { return Number(d.volume); };
        var price = function(d) { return Number(d.price); };
        var granularity = 60;

        function getBucketStart(tradeDate) {
            var granularityInMs = granularity * 1000;
            return new Date(Math.floor(tradeDate.getTime() / granularityInMs) * granularityInMs);
        }

        var collectOhlc = function(data, trade) {
            var bucketStart = getBucketStart(date(trade));
            var tradePrice = price(trade);
            var tradeVolume = volume(trade);
            var bisectDate = d3.bisector(function(d) { return d.date; }).left;
            var existing = data.filter(function(d) {
                return d.date.getTime() === bucketStart.getTime();
            })[0];
            if (existing) {
                existing.high = Math.max(tradePrice, existing.high);
                existing.low = Math.min(tradePrice, existing.low);
                existing.close = tradePrice;
                existing.volume += tradeVolume;
            } else {
                data.splice(bisectDate(data, bucketStart), 0, {
                    date: bucketStart,
                    open: tradePrice,
                    high: tradePrice,
                    low: tradePrice,
                    close: tradePrice,
                    volume: tradeVolume
                });
            }
        };

        collectOhlc.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            granularity = x;
            return collectOhlc;
        };

        collectOhlc.price = function(x) {
            if (!arguments.length) {
                return price;
            }
            price = x;
            return collectOhlc;
        };

        collectOhlc.volume = function(x) {
            if (!arguments.length) {
                return volume;
            }
            volume = x;
            return collectOhlc;
        };

        collectOhlc.date = function(x) {
            if (!arguments.length) {
                return date;
            }
            date = x;
            return collectOhlc;
        };

        return collectOhlc;
    }

    function dataInterface() {
        var dispatch = d3.dispatch(
            event.newTrade,
            event.historicDataLoaded,
            event.historicFeedError,
            event.streamingFeedError,
            event.streamingFeedClose);

        var _collectOhlc = collectOhlc()
            .date(function(d) {return new Date(d.time); })
            .volume(function(d) {return Number(d.size); });

        var source,
            callbackGenerator = callbackInvalidator(),
            candlesOfData = 200,
            data = [];

        function invalidate() {
            if (source && source.streamingFeed) {
                source.streamingFeed.close();
            }
            data = [];
            callbackGenerator.invalidateCallback();
        }

        function dateSortAscending(dataToSort) {
            return dataToSort.sort(function(a, b) {
                return a.date - b.date;
            });
        }

        function handleStreamingFeedEvents() {
            if (source.streamingFeed != null) {
                source.streamingFeed.on('message', function(trade) {
                    _collectOhlc(data, trade);
                    dispatch[event.newTrade](data, source);
                })
                .on('error', function(streamingFeedError) {
                    dispatch[event.streamingFeedError](streamingFeedError, source);
                })
                .on('close', function(closeEvent) {
                    dispatch[event.streamingFeedClose](closeEvent, source);
                });
                source.streamingFeed();
            }
        }

        function dataInterface(granularity, product) {
            invalidate();

            if (arguments.length === 2) {
                source = product.source;
                source.historicFeed.product(product.id);

                if (source.streamingFeed != null) {
                    source.streamingFeed.product(product.id);
                }
            }

            var now = new Date();

            source.historicFeed.end(now)
                .candles(candlesOfData)
                .granularity(granularity);

            _collectOhlc.granularity(granularity);

            source.historicFeed(callbackGenerator(function(historicFeedError, newData) {
                if (!historicFeedError) {
                    data = dateSortAscending(newData);
                    dispatch[event.historicDataLoaded](data, source);
                    handleStreamingFeedEvents();
                } else {
                    dispatch[event.historicFeedError](historicFeedError, source);
                }
            }));
        }

        dataInterface.candlesOfData = function(x) {
            if (!arguments.length) {
                return candlesOfData;
            }
            candlesOfData = x;
            return dataInterface;
        };

        d3.rebind(dataInterface, dispatch, 'on');

        return dataInterface;
    }

    function toast() {

        var dispatch = d3.dispatch(event.notificationClose);

        var panelDataJoin = fc.util.dataJoin()
            .selector('div.alert-content')
            .element('div')
            .attr('class', 'alert-content');

        var toastDataJoin = fc.util.dataJoin()
            .selector('div.alert')
            .element('div')
            .attr({'class': 'alert alert-info alert-dismissible', 'role': 'alert'})
            .key(function(d) { return d.id; });

        var toast = function(selection) {
            selection.each(function(model) {
                var container = d3.select(this);

                var panel = panelDataJoin(container, [model]);
                panel.enter().html('<div class="messages"></div>');

                var toasts = toastDataJoin(panel.select('.messages'), model.messages);

                var toastsEnter = toasts.enter();
                toastsEnter.html(
                    '<button type="button" class="close" aria-label="Close"> \
                    <span aria-hidden="true">&times;</span> \
                </button> \
                <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> \
                <span class="sr-only">Error:</span> \
                <span class="message"></span>');

                toastsEnter.select('.close')
                    .on('click', function(d) { dispatch[event.notificationClose](d.id); });

                toasts.select('.message')
                    .text(function(d) { return d.message; });
            });
        };

        d3.rebind(toast, dispatch, 'on');

        return toast;
    }

    var notification = {
        toast: toast
    };

    function message(message) {
        return {
            id: util.uid(),
            message: message
        };
    }

    function period(display, seconds, d3TimeInterval, timeFormat) {
        return {
            display: display || '1 day',
            seconds: seconds || 60 * 60 * 24,
            d3TimeInterval: d3TimeInterval || {unit: d3.time.day, value: 1},
            timeFormat: d3.time.format(timeFormat || '%b %d')
        };
    }

    function product(id, display, periods, source, volumeFormat, priceFormat) {
        return {
            id: id,
            display: display || 'Unspecified Product',
            priceFormat: d3.format(priceFormat || '.2f'),
            volumeFormat: d3.format(volumeFormat || '.2f'),
            periods: periods || [],
            source: source
        };
    }

    function source(historicFeed, historicNotificationFormatter, streamingFeed, streamingNotificationFormatter, discontinuityProvider) {
        return {
            historicFeed: historicFeed,
            historicNotificationFormatter: historicNotificationFormatter,
            streamingFeed: streamingFeed,
            streamingNotificationFormatter: streamingNotificationFormatter,
            discontinuityProvider: discontinuityProvider
        };
    }

    var data = {
        period: period,
        product: product,
        source: source
    };

    function webSocketCloseEventFormatter(event) {
        var message;
        if (event.wasClean === false && event.code !== 1000 && event.code !== 1006) {
            var reason = event.reason || 'Unkown reason.';
            message = 'Disconnected from live stream: ' + event.code + ' ' + reason;
        }
        return message;
    }

    function coinbaseStreamingErrorResponseFormatter(event) {
        var message;
        if (event.type === 'error' && event.message) {
            message = 'Live stream error: ' + event.message;
        } else if (event.type === 'close') {
            // The WebSocket's error event doesn't contain much useful information,
            // so the close event is used to report errors instead
            message = webSocketCloseEventFormatter(event);
        }
        return message;
    }

    function dropdownConfig(title, careted, listIcons, icon) {
        return {
            title: title || null,
            careted: careted || false,
            listIcons: listIcons || false,
            icon: icon || false
        };
    }

    function head$1(initialProducts, initialSelectedProduct, initialSelectedPeriod) {
        return {
            productConfig: dropdownConfig(null, true),
            mobilePeriodConfig: dropdownConfig(),
            products: initialProducts,
            selectedProduct: initialSelectedProduct,
            selectedPeriod: initialSelectedPeriod,
            alertMessages: [],
            primaryIndicators: [],
            secondaryIndicators: []
        };
    }

    function overlay$1(initialProducts, initialSelectedProduct) {
        return {
            primaryIndicators: [],
            secondaryIndicators: [],
            productConfig: dropdownConfig(),
            products: initialProducts,
            selectedProduct: initialSelectedProduct
        };
    }

    function option(displayString, valueString, option, icon, isPrimary) {
        return {
            displayString: displayString, // TODO: is 'displayName' better?
            valueString: valueString, // TODO: is this an id?
            option: option, // TODO: Ideally, remove.
            isSelected: false,
            icon: icon,
            isPrimary: isPrimary
        };
    }

    function selector(config, options) {
        return {
            config: config,
            options: options
        };
    }

    var menu$1 = {
        head: head$1,
        periodAdaptor: periodAdaptor,
        productAdaptor: productAdaptor,
        overlay: overlay$1,
        dropdownConfig: dropdownConfig,
        option: option,
        selector: selector
    };

    function group$1(legend, nav, primary, secondary, xAxis) {
        return {
            legend: legend,
            nav: nav,
            primary: primary,
            secondary: secondary,
            xAxis: xAxis
        };
    }

    function legend$1(initialProduct, initialPeriod) {
        return {
            data: undefined,
            product: initialProduct,
            period: initialPeriod
        };
    }

    function nav$1(initialDiscontinuityProvider) {
        return {
            data: [],
            viewDomain: [],
            trackingLatest: true,
            discontinuityProvider: initialDiscontinuityProvider
        };
    }

    function navigationReset$1() {
        return {
            trackingLatest: true
        };
    }

    function candlestickSeries() {
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();
        var barWidth = fc.util.fractionalBarWidth(0.75);
        var xValue = function(d) { return d.date; };
        var xValueScaled = function(d, i) { return xScale(xValue(d, i)); };
        var yLowValue = function(d) { return d.low; };
        var yHighValue = function(d) { return d.high; };
        var yCloseValue = function(d) { return d.close; };

        var candlestickSvg = fc.svg.candlestick()
          .x(function(d) { return xScale(d.date); })
          .open(function(d) { return yScale(d.open); })
          .high(function(d) { return yScale(yHighValue(d)); })
          .low(function(d) { return yScale(yLowValue(d)); })
          .close(function(d) { return yScale(d.close); });

        var upDataJoin = fc.util.dataJoin()
          .selector('path.up')
          .element('path')
          .attr('class', 'up');

        var downDataJoin = fc.util.dataJoin()
          .selector('path.down')
          .element('path')
          .attr('class', 'down');

        var candlestick = function(selection) {
            selection.each(function(data) {
                candlestickSvg.width(barWidth(data.map(xValueScaled)));

                var upData = data.filter(function(d) { return d.open < d.close; });
                var downData = data.filter(function(d) { return d.open >= d.close; });

                upDataJoin(this, [upData])
                  .attr('d', candlestickSvg);

                downDataJoin(this, [downData])
                  .attr('d', candlestickSvg);
            });
        };

        candlestick.xScale = function(x) {
            if (!arguments.length) {
                return xScale;
            }
            xScale = x;
            return candlestick;
        };
        candlestick.yScale = function(x) {
            if (!arguments.length) {
                return yScale;
            }
            yScale = x;
            return candlestick;
        };
        candlestick.xValue = function(x) {
            if (!arguments.length) {
                return xValue;
            }
            xValue = x;
            return candlestick;
        };
        candlestick.yLowValue = function(x) {
            if (!arguments.length) {
                return yLowValue;
            }
            yLowValue = x;
            return candlestick;
        };
        candlestick.yHighValue = function(x) {
            if (!arguments.length) {
                return yHighValue;
            }
            yHighValue = x;
            return candlestick;
        };
        candlestick.yCloseValue = function(x) {
            if (!arguments.length) {
                return yCloseValue;
            }
            yCloseValue = x;
            return candlestick;
        };
        candlestick.width = function(data) {
            return barWidth(data.map(xValueScaled));
        };

        return candlestick;
    }

    function primary$1(initialProduct, initialDiscontinuityProvider) {
        var model = {
            data: [],
            visibleData: [],
            trackingLatest: true,
            viewDomain: [],
            selectorsChanged: true,
            discontinuityProvider: initialDiscontinuityProvider
        };

        var _product = initialProduct;
        Object.defineProperty(model, 'product', {
            get: function() { return _product; },
            set: function(newValue) {
                _product = newValue;
                model.selectorsChanged = true;
            }
        });

        var candlestick = candlestickSeries();
        candlestick.id = util.uid();
        var _series = option('Candlestick', 'candlestick', candlestick);
        _series.option.extentAccessor = ['high', 'low'];
        Object.defineProperty(model, 'series', {
            get: function() { return _series; },
            set: function(newValue) {
                _series = newValue;
                model.selectorsChanged = true;
            }
        });

        var _yValueAccessor = {option: function(d) { return d.close; }};
        Object.defineProperty(model, 'yValueAccessor', {
            get: function() { return _yValueAccessor; },
            set: function(newValue) {
                _yValueAccessor = newValue;
                model.selectorsChanged = true;
            }
        });

        var _indicators = [];
        Object.defineProperty(model, 'indicators', {
            get: function() { return _indicators; },
            set: function(newValue) {
                _indicators = newValue;
                model.selectorsChanged = true;
            }
        });

        return model;
    }

    function secondary(initialProduct, initialDiscontinuityProvider) {
        return {
            data: [],
            visibleData: [],
            viewDomain: [],
            trackingLatest: true,
            product: initialProduct,
            discontinuityProvider: initialDiscontinuityProvider,
            indicators: []
        };
    }

    function xAxis$1(initialPeriod, initialDiscontinuityProvider) {
        return {
            viewDomain: [],
            period: initialPeriod,
            discontinuityProvider: initialDiscontinuityProvider
        };
    }

    var chart = {
        group: group$1,
        legend: legend$1,
        nav: nav$1,
        navigationReset: navigationReset$1,
        primary: primary$1,
        secondary: secondary,
        xAxis: xAxis$1
    };

    function messages() {
        return {
            messages: []
        };
    }

    var notification$1 = {
        message: message,
        messages: messages
    };

    var model = {
        menu: menu$1,
        chart: chart,
        data: data,
        notification: notification$1
    };

    function base() {
        var dispatch = d3.dispatch(event.viewChange);
        var xScale = fc.scale.dateTime();
        var yScale = d3.scale.linear();
        var trackingLatest = true;
        var yAxisWidth = 60;

        var multi = fc.series.multi();
        var chart = fc.chart.cartesian(xScale, yScale)
            .plotArea(multi)
            .xTicks(0)
            .yOrient('right')
            .margin({
                top: 0,
                left: 0,
                bottom: 0,
                right: yAxisWidth
            });
        var zoomWidth;

        function secondary(selection) {
            selection.each(function(model) {
                xScale.discontinuityProvider(model.discontinuityProvider);

                var container = d3.select(this)
                    .datum(model.visibleData)
                    .call(chart);

                var zoom = zoomBehavior(zoomWidth)
                    .scale(xScale)
                    .trackingLatest(trackingLatest)
                    .discontinuityProvider(model.discontinuityProvider)
                    .dataDateExtent(fc.util.extent().fields('date')(model.data))
                    .on('zoom', function(domain) {
                        dispatch[event.viewChange](domain);
                    });

                container.select('.plot-area-container')
                    .call(zoom);
            });
        }

        secondary.trackingLatest = function(x) {
            if (!arguments.length) {
                return trackingLatest;
            }
            trackingLatest = x;
            return secondary;
        };

        d3.rebind(secondary, dispatch, 'on');
        d3.rebind(secondary, multi, 'series', 'mapping', 'decorate');
        d3.rebind(secondary, chart, 'yTickValues', 'yTickFormat', 'yTicks', 'xDomain', 'yDomain');

        secondary.dimensionChanged = function(container) {
            zoomWidth = util.width(container.node()) - yAxisWidth;
        };

        return secondary;
    }

    function macd() {
        var dispatch = d3.dispatch(event.viewChange);
        var zeroLine = fc.annotation.line()
            .value(0)
            .label('');
        var renderer = fc.indicator.renderer.macd();
        var algorithm = fc.indicator.algorithm.macd();

        var chart = base()
            .series([zeroLine, renderer])
            .yTicks(5)
            .mapping(function(series) {
                return series === zeroLine ? [0] : this;
            })
            .decorate(function(g) {
                g.enter()
                    .attr('class', function(d, i) {
                        return ['multi zero', 'multi'][i];
                    });
            })
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function macd(selection) {
            var model = selection.datum();
            algorithm(model.data);

            var paddedYExtent = fc.util.extent()
                .fields('macd')
                .symmetricalAbout(0)
                .pad(0.08)(model.data.map(function(d) { return d.macd; }));
            chart.trackingLatest(model.trackingLatest)
                .xDomain(model.viewDomain)
                .yDomain(paddedYExtent);

            selection.call(chart);
        }

        d3.rebind(macd, dispatch, 'on');

        macd.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return macd;
    }

    function rsi() {
        var dispatch = d3.dispatch(event.viewChange);
        var renderer = fc.indicator.renderer.relativeStrengthIndex();
        var algorithm = fc.indicator.algorithm.relativeStrengthIndex();
        var tickValues = [renderer.lowerValue(), 50, renderer.upperValue()];

        var chart = base()
            .series([renderer])
            .yTickValues(tickValues)
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function rsi(selection) {
            var model = selection.datum();
            algorithm(model.data);

            chart.trackingLatest(model.trackingLatest)
                .xDomain(model.viewDomain)
                .yDomain([0, 100]);

            selection.call(chart);
        }

        d3.rebind(rsi, dispatch, 'on');

        rsi.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return rsi;
    }

    function volume() {
        var dispatch = d3.dispatch(event.viewChange);
        var volumeBar = fc.series.bar()
          .xValue(function(d) { return d.date; })
          .yValue(function(d) { return d.volume; });

        var chart = base()
            .series([volumeBar])
            .yTicks(4)
            .on(event.viewChange, function(domain) {
                dispatch[event.viewChange](domain);
            });

        function volume(selection) {
            selection.each(function(model) {
                var paddedYExtent = fc.util.extent()
                    .fields('volume')
                    .pad(0.08)(model.data);
                if (paddedYExtent[0] < 0) {
                    paddedYExtent[0] = 0;
                }
                chart.yTickFormat(model.product.volumeFormat)
                    .trackingLatest(model.trackingLatest)
                    .xDomain(model.viewDomain)
                    .yDomain(paddedYExtent);

                selection.call(chart);
            });
        }

        d3.rebind(volume, dispatch, 'on');

        volume.dimensionChanged = function(container) {
            chart.dimensionChanged(container);
        };

        return volume;
    }

    var secondary$1 = {
        base: base,
        macd: macd,
        rsi: rsi,
        volume: volume
    };

    var chart$1 = {
        legend: legend,
        nav: nav,
        primary: primary,
        xAxis: xAxis,
        secondary: secondary$1,
        multiChart: multiChart,
        group: group
    };

    function dataGeneratorAdaptor() {

        var dataGenerator = fc.data.random.financial(),
            allowedPeriods = [60 * 60 * 24],
            candles,
            end,
            granularity,
            product = null;

        var dataGeneratorAdaptor = function(cb) {
            end.setHours(0, 0, 0, 0);
            var millisecondsPerDay = 24 * 60 * 60 * 1000;
            dataGenerator.startDate(new Date(end - (candles - 1) * millisecondsPerDay));

            var data = dataGenerator(candles);
            cb(null, data);
        };

        dataGeneratorAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return dataGeneratorAdaptor;
        };

        dataGeneratorAdaptor.end = function(x) {
            if (!arguments.length) {
                return end;
            }
            end = x;
            return dataGeneratorAdaptor;
        };

        dataGeneratorAdaptor.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            if (allowedPeriods.indexOf(x) === -1) {
                throw new Error('Granularity of ' + x + ' is not supported. '
                 + 'Random Financial Data Generator only supports daily data.');
            }
            granularity = x;
            return dataGeneratorAdaptor;
        };

        dataGeneratorAdaptor.product = function(x) {
            if (!arguments.length) {
                return product;
            }
            if (x !== 'Data Generator') {
                throw new Error('Random Financial Data Generator does not support products.');
            }
            product = x;
            return dataGeneratorAdaptor;
        };

        dataGeneratorAdaptor.apiKey = function() {
            throw new Error('Not implemented.');
        };

        return dataGeneratorAdaptor;
    }

    function coinbaseAdaptor() {
        var rateLimit = 1000;       // The coinbase API has a limit of 1 request per second

        var historicFeed = fc.data.feed.coinbase(),
            candles;

        var coinbaseAdaptor = debounce(function coinbaseAdaptor(cb) {
            var startDate = d3.time.second.offset(historicFeed.end(), -candles * historicFeed.granularity());
            historicFeed.start(startDate);
            historicFeed(cb);
        }, rateLimit);

        coinbaseAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return coinbaseAdaptor;
        };

        coinbaseAdaptor.apiKey = function() {
            throw new Error('Not implemented.');
        };

        d3.rebind(coinbaseAdaptor, historicFeed, 'end', 'granularity', 'product');

        return coinbaseAdaptor;
    }

    function coinbaseHistoricErrorResponseFormatter(responseObject) {
        var message;
        if (responseObject) {
            message = responseObject.message;
        }
        return message;
    }

    // https://docs.exchange.coinbase.com/#websocket-feed

    function coinbaseWebSocket() {

        var product = 'BTC-USD';
        var dispatch = d3.dispatch('open', 'close', 'error', 'message');
        var messageType = 'match';
        var socket;

        var webSocket = function(url, subscribe) {
            url = url || 'wss://ws-feed.exchange.coinbase.com';
            subscribe = subscribe || {
                'type': 'subscribe',
                'product_id': product
            };

            socket = new WebSocket(url);

            socket.onopen = function(event) {
                socket.send(JSON.stringify(subscribe));
                dispatch.open(event);
            };
            socket.onerror = function(event) {
                dispatch.error(event);
            };
            socket.onclose = function(event) {
                dispatch.close(event);
            };
            socket.onmessage = function(event) {
                var msg = JSON.parse(event.data);
                if (msg.type === messageType) {
                    dispatch.message(msg);
                } else if (msg.type === 'error') {
                    dispatch.error(msg);
                }
            };
        };

        d3.rebind(webSocket, dispatch, 'on');

        webSocket.close = function() {
            // Only close the WebSocket if it is opening or open
            if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
                socket.close();
            }
        };

        webSocket.messageType = function(x) {
            if (!arguments.length) {
                return messageType;
            }
            messageType = x;
            return webSocket;
        };

        webSocket.product = function(x) {
            if (!arguments.length) {
                return product;
            }
            product = x;
            return webSocket;
        };

        return webSocket;
    }

    function quandlAdaptor() {

        var historicFeed = fc.data.feed.quandl()
                .database('WIKI')
                .columnNameMap(mapColumnNames),
            granularity,
            candles;

        // More options are allowed through the API; for now, only support daily and weekly
        var allowedPeriods = d3.map();
        allowedPeriods.set(60 * 60 * 24, 'daily');
        allowedPeriods.set(60 * 60 * 24 * 7, 'weekly');

        // Map fields for WIKI database, to use all adjusted values
        var columnNameMap = d3.map();
        columnNameMap.set('Open', 'unadjustedOpen');
        columnNameMap.set('High', 'unadjustedHigh');
        columnNameMap.set('Low', 'unadjustedLow');
        columnNameMap.set('Close', 'unadjustedClose');
        columnNameMap.set('Volume', 'unadjustedVolume');
        columnNameMap.set('Adj. Open', 'open');
        columnNameMap.set('Adj. High', 'high');
        columnNameMap.set('Adj. Low', 'low');
        columnNameMap.set('Adj. Close', 'close');
        columnNameMap.set('Adj. Volume', 'volume');

        function mapColumnNames(colName) {
            var mappedName = columnNameMap.get(colName);
            if (!mappedName) {
                mappedName = colName[0].toLowerCase() + colName.substr(1);
            }
            return mappedName;
        }

        function normaliseDataDateToStartOfDay(data) {
            return data.map(function(datum) {
                datum.date.setHours(0, 0, 0, 0);
                return datum;
            });
        }

        function quandlAdaptor(cb) {
            var startDate = d3.time.second.offset(historicFeed.end(), -candles * granularity);
            historicFeed.start(startDate)
                .collapse(allowedPeriods.get(granularity));
            historicFeed(function(err, data) {
                var normalisedData = normaliseDataDateToStartOfDay(data);
                cb(err, normalisedData);
            });
        }

        quandlAdaptor.candles = function(x) {
            if (!arguments.length) {
                return candles;
            }
            candles = x;
            return quandlAdaptor;
        };

        quandlAdaptor.granularity = function(x) {
            if (!arguments.length) {
                return granularity;
            }
            if (!allowedPeriods.has(x)) {
                throw new Error('Granularity of ' + x + ' is not supported.');
            }
            granularity = x;
            return quandlAdaptor;
        };

        fc.util.rebind(quandlAdaptor, historicFeed, {
            end: 'end',
            product: 'dataset',
            apiKey: 'apiKey'
        });

        return quandlAdaptor;
    }

    function quandlHistoricErrorResponseFormatter(responseObject) {
        var message;
        if (responseObject && responseObject.quandl_error) {
            message = responseObject.quandl_error.message;
        }
        return message;
    }

    // TODO: Temp until merged into d3fc
    function skipWeekendsDiscontinuityProvider() {
        var millisPerDay = 24 * 3600 * 1000;
        var millisPerWorkWeek = millisPerDay * 5;
        var millisPerWeek = millisPerDay * 7;

        var skipWeekends = {};

        function isWeekend(date) {
            return date.getDay() === 0 || date.getDay() === 6;
        }

        skipWeekends.clampDown = function(date) {
            if (date && isWeekend(date)) {
                var daysToSubtract = date.getDay() === 0 ? 2 : 1;
                // round the date up to midnight
                var newDate = d3.time.day.ceil(date);
                // then subtract the required number of days
                return d3.time.day.offset(newDate, -daysToSubtract);
            } else {
                return date;
            }
        };

        skipWeekends.clampUp = function(date) {
            if (date && isWeekend(date)) {
                var daysToAdd = date.getDay() === 0 ? 1 : 2;
                // round the date down to midnight
                var newDate = d3.time.day.floor(date);
                // then add the required number of days
                return d3.time.day.offset(newDate, daysToAdd);
            } else {
                return date;
            }
        };

        // returns the number of included milliseconds (i.e. those which do not fall)
        // within discontinuities, along this scale
        skipWeekends.distance = function(startDate, endDate) {
            startDate = skipWeekends.clampUp(startDate);
            endDate = skipWeekends.clampDown(endDate);

            // move the start date to the end of week boundary
            var offsetStart = d3.time.saturday.ceil(startDate);
            if (endDate < offsetStart) {
                return endDate.getTime() - startDate.getTime();
            }

            var msAdded = offsetStart.getTime() - startDate.getTime();

            // move the end date to the end of week boundary
            var offsetEnd = d3.time.saturday.ceil(endDate);
            var msRemoved = offsetEnd.getTime() - endDate.getTime();

            // determine how many weeks there are between these two dates
            var weeks = Math.round((offsetEnd.getTime() - offsetStart.getTime()) / millisPerWeek);

            return weeks * millisPerWorkWeek + msAdded - msRemoved;
        };

        skipWeekends.offset = function(startDate, ms) {
            var date = isWeekend(startDate) ? skipWeekends.clampUp(startDate) : startDate;
            var remainingms = ms;

            if (remainingms < 0) {
                var startOfWeek = d3.time.monday.floor(date);
                remainingms -= (startOfWeek.getTime() - date.getTime());

                if (remainingms >= 0) {
                    return new Date(date.getTime() + ms);
                }

                date = d3.time.day.offset(startOfWeek, -2);

                var weeks = Math.floor(remainingms / millisPerWorkWeek);
                date = d3.time.day.offset(date, weeks * 7);
                remainingms -= weeks * millisPerWorkWeek;

                date = new Date(date.getTime() + remainingms);
                date = d3.time.day.offset(date, 2);
                return date;
            } else {
                // move to the end of week boundary
                var endOfWeek = d3.time.saturday.ceil(date);
                remainingms -= (endOfWeek.getTime() - date.getTime());

                // if the distance to the boundary is greater than the number of ms
                // simply add the ms to the current date
                if (remainingms < 0) {
                    return new Date(date.getTime() + ms);
                }

                // skip the weekend
                date = d3.time.day.offset(endOfWeek, 2);

                // add all of the complete weeks to the date
                var completeWeeks = Math.floor(remainingms / millisPerWorkWeek);
                date = d3.time.day.offset(date, completeWeeks * 7);
                remainingms -= completeWeeks * millisPerWorkWeek;

                // add the remaining time
                date = new Date(date.getTime() + remainingms);
                return date;
            }
        };

        skipWeekends.copy = function() { return skipWeekends; };

        return skipWeekends;
    }

    function initialiseModel() {
        function initialisePeriods() {
            return {
                week1: model.data.period('Weekly', 60 * 60 * 24 * 7, {unit: d3.time.week, value: 1}, '%b %d'),
                day1: model.data.period('Daily', 60 * 60 * 24, {unit: d3.time.day, value: 1}, '%b %d'),
                hour1: model.data.period('1 Hr', 60 * 60, {unit: d3.time.hour, value: 1}, '%b %d %Hh'),
                minute5: model.data.period('5 Min', 60 * 5, {unit: d3.time.minute, value: 5}, '%H:%M'),
                minute1: model.data.period('1 Min', 60, {unit: d3.time.minute, value: 1}, '%H:%M')
            };
        }

        function initialiseSources() {
            return {
                generated: model.data.source(
                    dataGeneratorAdaptor(),
                    null,
                    null,
                    null,
                    fc.scale.discontinuity.identity()),
                bitcoin: model.data.source(
                    coinbaseAdaptor(),
                    coinbaseHistoricErrorResponseFormatter,
                    coinbaseWebSocket(),
                    coinbaseStreamingErrorResponseFormatter,
                    fc.scale.discontinuity.identity()),
                quandl: model.data.source(
                    quandlAdaptor(),
                    quandlHistoricErrorResponseFormatter,
                    null,
                    null,
                    skipWeekendsDiscontinuityProvider())
            };
        }

        function initialiseProducts() {
            return {
                generated: model.data.product('Data Generator', 'Data Generator', [periods.day1], sources.generated, '.3s'),
                quandl: model.data.product('GOOG', 'GOOG', [periods.day1], sources.quandl, '.3s')
            };
        }

        function initialiseSeriesSelector() {

            var candlestick = candlestickSeries();
            candlestick.id = util.uid();
            var candlestickOption = model.menu.option(
                'Candlestick',
                'candlestick',
                candlestick,
                'bf-icon-candlestick-series');
            candlestickOption.isSelected = true;
            candlestickOption.option.extentAccessor = ['high', 'low'];

            var ohlc = fc.series.ohlc();
            ohlc.id = util.uid();
            var ohlcOption = model.menu.option('OHLC', 'ohlc', ohlc, 'bf-icon-ohlc-series');
            ohlcOption.option.extentAccessor = ['high', 'low'];

            var line = fc.series.line()
                .xValue(function(d) { return d.date; });
            line.id = util.uid();
            var lineOption = model.menu.option('Line', 'line', line, 'bf-icon-line-series');
            lineOption.option.extentAccessor = 'close';

            var point = fc.series.point()
                .xValue(function(d) { return d.date; });
            point.id = util.uid();
            var pointOption = model.menu.option('Point', 'point', point, 'bf-icon-point-series');
            pointOption.option.extentAccessor = 'close';

            var area = fc.series.area()
                .xValue(function(d) { return d.date; });
            area.id = util.uid();
            var areaOption = model.menu.option('Area', 'area', area, 'bf-icon-area-series');
            areaOption.option.extentAccessor = 'close';

            var config = model.menu.dropdownConfig(null, false, true, true);

            var options = [
                candlestickOption,
                ohlcOption,
                lineOption,
                pointOption,
                areaOption
            ];

            return model.menu.selector(config, options);
        }

        function initialiseIndicatorOptions() {
            var secondary = chart$1.secondary;

            var movingAverage = fc.series.line()
                .decorate(function(select) {
                    select.enter()
                        .classed('movingAverage', true);
                })
                .xValue(function(d) { return d.date; })
                .yValue(function(d) { return d.movingAverage; });
            movingAverage.id = util.uid();

            var movingAverageOption = model.menu.option('Moving Average', 'movingAverage',
                movingAverage, 'bf-icon-moving-average-indicator', true);
            movingAverageOption.option.extentAccessor = function(d) { return d.movingAverage; };

            var bollingerBands = fc.indicator.renderer.bollingerBands();
            bollingerBands.id = util.uid();

            var bollingerBandsOption = model.menu.option('Bollinger Bands', 'bollinger',
                bollingerBands, 'bf-icon-bollinger-bands-indicator', true);
            bollingerBandsOption.option.extentAccessor = [function(d) { return d.bollingerBands.lower; },
                function(d) { return d.bollingerBands.upper; }];

            var rsi = secondary.rsi();
            rsi.id = util.uid();

            var macd = secondary.macd();
            macd.id = util.uid();

            var volume = secondary.volume();
            volume.id = util.uid();

            var indicators = [
                movingAverageOption,
                bollingerBandsOption,
                model.menu.option('Relative Strength Index', 'rsi',
                    rsi, 'bf-icon-rsi-indicator', false),
                model.menu.option('MACD', 'macd',
                    macd, 'bf-icon-macd-indicator', false),
                model.menu.option('Volume', 'volume',
                    volume, 'bf-icon-bar-series', false)
            ];

            return indicators;
        }

        function initialiseIndicatorSelector() {
            var config = model.menu.dropdownConfig('Add Indicator', false, true);

            return model.menu.selector(config, initialiseIndicatorOptions());
        }

        function initialiseSelectors() {
            return {
                seriesSelector: initialiseSeriesSelector(),
                indicatorSelector: initialiseIndicatorSelector()
            };
        }

        function initialiseCharts() {
            var legend = model.chart.legend(products.generated, periods.day1);
            var nav = model.chart.nav(products.generated.source.discontinuityProvider);
            var primary = model.chart.primary(products.generated, products.generated.source.discontinuityProvider);
            var secondary = model.chart.secondary(products.generated, products.generated.source.discontinuityProvider);
            var xAxis = model.chart.xAxis(periods.day1, products.generated.source.discontinuityProvider);

            return model.chart.group(legend, nav, primary, secondary, xAxis);
        }

        var periods = initialisePeriods();
        var sources = initialiseSources();
        var products = initialiseProducts();

        return {
            data: [],
            periods: periods,
            sources: sources,
            selectors: initialiseSelectors(),
            navReset: model.chart.navigationReset(),
            headMenu: model.menu.head([products.generated, products.quandl], products.generated, periods.day1),
            overlay: model.menu.overlay([products.generated, products.quandl], products.generated),
            notificationMessages: model.notification.messages(),
            charts: initialiseCharts()
        };
    }

    function getCoinbaseProducts(callback) {
        d3.json('https://api.exchange.coinbase.com/products', function(error, response) {
            if (error) {
                callback(error);
                return;
            }
            callback(error, response);
        });
    }

    function formatCoinbaseProducts(products, source, defaultPeriods, productPeriodOverrides) {
        return products.map(function(product) {
            return model.data.product(product.id, product.id,
                productPeriodOverrides.get(product.id) || defaultPeriods, source);
        });
    }

    function app() {

        var appTemplate = '<div class="container-fluid"> \
        <div id="notifications"></div> \
        <div id="loading-status-message"></div> \
        <div class="row head-menu head-row"> \
            <div class="col-md-12 head-sub-row"> \
                <div id="product-dropdown" class="dropdown product-dropdown"></div> \
                <div class="selectors"> \
                    <div class="series-dropdown dropdown selector-dropdown"></div> \
                    <div class="indicator-dropdown dropdown selector-dropdown"></div> \
                    <div id="mobile-period-selector" class="dropdown"></div> \
                </div> \
                <div id="period-selector"></div> \
                <span id="clear-indicators" class="icon bf-icon-delete delete-button"></span> \
            </div> \
        </div> \
        <div class="row primary-row"> \
            <div id="charts" class="col-md-12"> \
                <div id="charts-container"> \
                    <svg id="primary-container"></svg> \
                    <div id="secondaries-container"></div> \
                    <div class="x-axis-row"> \
                        <svg id="x-axis-container"></svg> \
                    </div> \
                    <div id="navbar-row"> \
                        <svg id="navbar-container"></svg> \
                        <svg id="navbar-reset"></svg> \
                    </div> \
                </div> \
                <div id="overlay"> \
                    <div id="overlay-primary-container"> \
                        <div id="overlay-primary-head"> \
                            <div class="selectors"> \
                                <div id="mobile-product-dropdown" class="dropdown"></div> \
                                <div class="series-dropdown dropdown selector-dropdown"></div> \
                                <div class="indicator-dropdown dropdown selector-dropdown"></div> \
                            </div> \
                            <div id="legend"> \
                                <svg id="tooltip"></svg> \
                            </div> \
                        </div> \
                        <div id="overlay-primary-bottom"> \
                            <div class="edit-indicator-container"></div> \
                        </div> \
                    </div> \
                    <div id="overlay-secondaries-container"></div> \
                    <div class="x-axis-row"></div> \
                    <div id="overlay-navbar-row"></div> \
                </div> \
            </div> \
        </div> \
    </div>';

        var app = {};

        var containers;

        var model = initialiseModel();

        var _dataInterface = initialiseDataInterface();
        var charts = initialiseCharts();

        var externalHistoricFeedErrorCallback;

        var overlay;
        var headMenu;
        var navReset;
        var selectors;
        var toastNotifications;

        var fetchCoinbaseProducts = false;

        var proportionOfDataToDisplayByDefault = 0.2;

        var firstRender = true;
        function renderInternal() {
            if (firstRender) {
                firstRender = false;
            }
            if (layoutRedrawnInNextRender) {
                containers.suspendLayout(false);
            }

            containers.chartsAndOverlay.datum(model.charts)
                .call(charts);

            containers.app.select('#navbar-reset')
                .datum(model.navReset)
                .call(navReset);

            containers.app.select('.head-menu')
                .datum(model.headMenu)
                .call(headMenu);

            containers.app.selectAll('.selectors')
                .datum(model.selectors)
                .call(selectors);

            containers.app.select('#notifications')
                .datum(model.notificationMessages)
                .call(toastNotifications);

            containers.overlay.datum(model.overlay)
                .call(overlay);

            if (layoutRedrawnInNextRender) {
                containers.suspendLayout(true);
                layoutRedrawnInNextRender = false;
            }
        }

        var render = fc.util.render(renderInternal);

        var layoutRedrawnInNextRender = true;

        function updateLayout() {
            layoutRedrawnInNextRender = true;
            util.layout(containers, charts);
        }

        function initialiseResize() {
            d3.select(window).on('resize', function() {
                updateLayout();
                render();
            });
        }

        function addNotification(message$$) {
            model.notificationMessages.messages.unshift(message(message$$));
        }

        function onViewChange(domain) {
            var viewDomain = [domain[0], domain[1]];
            model.charts.primary.viewDomain = viewDomain;
            model.charts.secondary.viewDomain = viewDomain;
            model.charts.xAxis.viewDomain = viewDomain;
            model.charts.nav.viewDomain = viewDomain;

            var visibleData = util.domain.filterDataInDateRange(viewDomain, model.data);
            model.charts.primary.visibleData = visibleData;
            model.charts.secondary.visibleData = visibleData;

            var trackingLatest = util.domain.trackingLatestData(
                model.charts.primary.viewDomain,
                model.charts.primary.data);
            model.charts.primary.trackingLatest = trackingLatest;
            model.charts.secondary.trackingLatest = trackingLatest;
            model.charts.nav.trackingLatest = trackingLatest;
            model.navReset.trackingLatest = trackingLatest;
            render();
        }

        function onPrimaryIndicatorChange(indicator) {
            indicator.isSelected = !indicator.isSelected;
            updatePrimaryChartIndicators();
            render();
        }

        function onSecondaryChartChange(_chart) {
            _chart.isSelected = !_chart.isSelected;
            updateSecondaryCharts();
            render();
        }

        function onCrosshairChange(dataPoint) {
            model.charts.legend.data = dataPoint;
            render();
        }

        function onStreamingFeedCloseOrError(streamingEvent, source) {
            var message$$;
            if (source.streamingNotificationFormatter) {
                message$$ = source.streamingNotificationFormatter(streamingEvent);
            } else {
                // #515 (https://github.com/ScottLogic/BitFlux/issues/515)
                // (TODO) prevents errors when formatting streaming close/error messages when product changes.
                // As we only have a coinbase streaming source at the moment, this is a suitable fix for now
                message$$ = coinbaseStreamingErrorResponseFormatter(streamingEvent);
            }
            if (message$$) {
                addNotification(message$$);
                render();
            }
        }

        function resetToLatest() {
            var data = model.charts.primary.data;
            var dataDomain = fc.util.extent()
                .fields('date')(data);
            var navTimeDomain = util.domain.moveToLatest(
                model.charts.primary.discontinuityProvider,
                dataDomain,
                dataDomain,
                proportionOfDataToDisplayByDefault);
            onViewChange(navTimeDomain);
        }

        function loading(isLoading, error) {
            var spinner = '<div class="spinner"></div>';
            var obscure = arguments.length > 1 || isLoading;

            var errorMessage = '';
            if (error && error.length) {
                errorMessage = '<div class="content alert alert-info">' + error + '</div>';
            }
            containers.app.select('#loading-status-message')
                .classed('hidden', !obscure)
                .html(error ? errorMessage : spinner);
        }

        function updateModelData(data) {
            model.data = data;
            model.charts.primary.data = data;
            model.charts.secondary.data = data;
            model.charts.nav.data = data;
        }

        function updateDiscontinuityProvider(productSource) {
            var discontinuityProvider = productSource.discontinuityProvider;

            model.charts.xAxis.discontinuityProvider = discontinuityProvider;
            model.charts.nav.discontinuityProvider = discontinuityProvider;
            model.charts.primary.discontinuityProvider = discontinuityProvider;
            model.charts.secondary.discontinuityProvider = discontinuityProvider;
        }

        function updateModelSelectedProduct(product) {
            model.headMenu.selectedProduct = product;
            model.overlay.selectedProduct = product;
            model.charts.primary.product = product;
            model.charts.secondary.product = product;
            model.charts.legend.product = product;

            updateDiscontinuityProvider(product.source);
        }

        function updateModelSelectedPeriod(period) {
            model.headMenu.selectedPeriod = period;
            model.charts.xAxis.period = period;
            model.charts.legend.period = period;
        }

        function changeProduct(product) {
            loading(true);
            updateModelSelectedProduct(product);
            updateModelSelectedPeriod(product.periods[0]);
            _dataInterface(product.periods[0].seconds, product);
        }

        function initialiseCharts() {
            return group()
                .on(event.crosshairChange, onCrosshairChange)
                .on(event.viewChange, onViewChange);
        }

        function initialiseNavReset() {
            return menu.navigationReset()
                .on(event.resetToLatest, resetToLatest);
        }

        function initialiseDataInterface() {
            return dataInterface()
                .on(event.newTrade, function(data) {
                    updateModelData(data);
                    if (model.charts.primary.trackingLatest) {
                        var newDomain = util.domain.moveToLatest(
                            model.charts.primary.discontinuityProvider,
                            model.charts.primary.viewDomain,
                            fc.util.extent().fields('date')(model.charts.primary.data));
                        onViewChange(newDomain);
                    }
                })
                .on(event.historicDataLoaded, function(data) {
                    loading(false);
                    updateModelData(data);
                    model.charts.legend.data = null;
                    resetToLatest();
                    updateLayout();
                })
                .on(event.historicFeedError, function(err, source) {
                    if (externalHistoricFeedErrorCallback) {
                        var error = externalHistoricFeedErrorCallback(err) || true;
                        loading(false, error);
                    } else {
                        loading(false, 'Error loading data. Please make your selection again, or refresh the page.');
                        var responseText = '';
                        try {
                            var responseObject = JSON.parse(err.responseText);
                            var formattedMessage = source.historicNotificationFormatter(responseObject);
                            if (formattedMessage) {
                                responseText = '. ' + formattedMessage;
                            }
                        } catch (e) {
                            responseText = '';
                        }
                        var statusText = err.statusText || 'Unknown reason.';
                        var message$$ = 'Error getting historic data: ' + statusText + responseText;

                        addNotification(message$$);
                    }
                    render();
                })
                .on(event.streamingFeedError, onStreamingFeedCloseOrError)
                .on(event.streamingFeedClose, onStreamingFeedCloseOrError);
        }

        function initialiseHeadMenu() {
            return menu.head()
                .on(event.dataProductChange, function(product) {
                    changeProduct(product.option);
                    render();
                })
                .on(event.dataPeriodChange, function(period) {
                    loading(true);
                    updateModelSelectedPeriod(period.option);
                    _dataInterface(period.option.seconds);
                    render();
                })
                .on(event.clearAllPrimaryChartIndicatorsAndSecondaryCharts, function() {
                    model.charts.primary.indicators.forEach(deselectOption);
                    model.charts.secondary.indicators.forEach(deselectOption);

                    updatePrimaryChartIndicators();
                    updateSecondaryCharts();
                    render();
                });
        }

        function selectOption(option, options) {
            options.forEach(function(_option) {
                _option.isSelected = false;
            });
            option.isSelected = true;
        }

        function deselectOption(option) { option.isSelected = false; }

        function initialiseSelectors() {
            return menu.selectors()
                .on(event.primaryChartSeriesChange, function(series) {
                    model.charts.primary.series = series;
                    selectOption(series, model.selectors.seriesSelector.options);
                    render();
                })
                .on(event.primaryChartIndicatorChange, onPrimaryIndicatorChange)
                .on(event.secondaryChartChange, onSecondaryChartChange);
        }

        function updatePrimaryChartIndicators() {
            model.charts.primary.indicators =
                model.selectors.indicatorSelector.options.filter(function(option) {
                    return option.isSelected && option.isPrimary;
                });

            model.overlay.primaryIndicators = model.charts.primary.indicators;
            model.headMenu.primaryIndicators = model.charts.primary.indicators;
        }

        function updateSecondaryChartModels() {
            model.charts.secondary.indicators = model.selectors.indicatorSelector.options.filter(function(option) {
                return option.isSelected && !option.isPrimary;
            });

            charts.secondaries().charts(model.charts.secondary.indicators.map(function(indicator) {
                return indicator;
            }));

            model.overlay.secondaryIndicators = model.charts.secondary.indicators;
            model.headMenu.secondaryIndicators = model.charts.secondary.indicators;
        }

        function updateSecondaryCharts() {
            updateSecondaryChartModels();
            updateLayout();
        }

        function initialiseOverlay() {
            return menu.overlay()
                .on(event.primaryChartIndicatorChange, onPrimaryIndicatorChange)
                .on(event.secondaryChartChange, onSecondaryChartChange)
                .on(event.dataProductChange, function(product) {
                    changeProduct(product.option);
                    render();
                });
        }

        function onNotificationClose(id) {
            model.notificationMessages.messages = model.notificationMessages.messages.filter(function(message$$) { return message$$.id !== id; });
            render();
        }

        function initialiseNotifications() {
            return notification.toast()
                .on(event.notificationClose, onNotificationClose);
        }

        function addCoinbaseProducts(error, bitcoinProducts) {
            if (error) {
                var statusText = error.statusText || 'Unknown reason.';
                var message$$ = 'Error retrieving Coinbase products: ' + statusText;
                model.notificationMessages.messages.unshift(message(message$$));
            } else {
                var defaultPeriods = [model.periods.hour1, model.periods.day1];
                var productPeriodOverrides = d3.map();
                productPeriodOverrides.set('BTC-USD', [model.periods.minute1, model.periods.minute5, model.periods.hour1, model.periods.day1]);
                var formattedProducts = formatCoinbaseProducts(bitcoinProducts, model.sources.bitcoin, defaultPeriods, productPeriodOverrides);
                model.headMenu.products = model.headMenu.products.concat(formattedProducts);
                model.overlay.products = model.headMenu.products;
            }

            render();
        }

        app.fetchCoinbaseProducts = function(x) {
            if (!arguments.length) {
                return fetchCoinbaseProducts;
            }
            fetchCoinbaseProducts = x;
            return app;
        };

        app.changeQuandlProduct = function(productString) {
            var product = data.product(productString, productString, [model.periods.day1], model.sources.quandl, '.3s');
            var existsInHeadMenuProducts = model.headMenu.products.some(function(p) { return p.id === product.id; });
            var existsInOverlayProducts = model.overlay.products.some(function(p) { return p.id === product.id; });

            if (!existsInHeadMenuProducts) {
                model.headMenu.products.push(product);
            }

            if (!existsInOverlayProducts) {
                model.overlay.products.push(product);
            }

            changeProduct(product);

            if (!firstRender) {
                render();
            }
        };

        app.proportionOfDataToDisplayByDefault = function(x) {
            if (!arguments.length) {
                return proportionOfDataToDisplayByDefault;
            }
            proportionOfDataToDisplayByDefault = x;
            return app;
        };

        app.historicFeedErrorCallback = function(x) {
            if (!arguments.length) {
                return externalHistoricFeedErrorCallback;
            }
            externalHistoricFeedErrorCallback = x;
            return app;
        };

        app.indicators = function(x) {
            if (!arguments.length) {
                var indicators = [];
                model.selectors.indicatorSelector.options.forEach(function(option) {
                    if (option.isSelected) {
                        indicators.push(option.valueString);
                    }
                });
                return indicators;
            }

            model.selectors.indicatorSelector.options.forEach(function(indicator) {
                indicator.isSelected = x.some(function(indicatorValueStringToShow) { return indicatorValueStringToShow === indicator.valueString; });
            });

            updatePrimaryChartIndicators();
            if (!firstRender) {
                updateSecondaryCharts();
                render();
            } else {
                updateSecondaryChartModels();
            }

            return app;
        };

        app.run = function(element) {
            if (!element) {
                throw new Error('An element must be specified when running the application.');
            }

            var appContainer = d3.select(element);
            appContainer.html(appTemplate);

            var chartsAndOverlayContainer = appContainer.select('#charts');
            var chartsContainer = appContainer.select('#charts-container');
            var overlayContainer = appContainer.select('#overlay');
            containers = {
                app: appContainer,
                charts: chartsContainer,
                chartsAndOverlay: chartsAndOverlayContainer,
                primary: chartsContainer.select('#primary-container'),
                secondaries: chartsContainer.select('#secondaries-container'),
                xAxis: chartsContainer.select('#x-axis-container'),
                navbar: chartsContainer.select('#navbar-container'),
                overlay: overlayContainer,
                overlaySecondaries: overlayContainer.select('#overlay-secondaries-container'),
                legend: appContainer.select('#legend'),
                suspendLayout: function(value) {
                    var self = this;
                    Object.keys(self).forEach(function(key) {
                        if (typeof self[key] !== 'function') {
                            self[key].layoutSuspended(value);
                        }
                    });
                }
            };

            headMenu = initialiseHeadMenu();
            navReset = initialiseNavReset();
            selectors = initialiseSelectors();
            overlay = initialiseOverlay();
            toastNotifications = initialiseNotifications();

            updateLayout();
            initialiseResize();
            _dataInterface(model.headMenu.selectedPeriod.seconds, model.headMenu.selectedProduct);

            if (fetchCoinbaseProducts) {
                getCoinbaseProducts(addCoinbaseProducts);
            } else if (model.sources.bitcoin) {
                delete model.sources.bitcoin;
            }
        };

        fc.util.rebind(app, model.sources.quandl.historicFeed, {
            quandlApiKey: 'apiKey'
        });

        fc.util.rebind(app, _dataInterface, {
            periodsOfDataToFetch: 'candlesOfData'
        });

        return app;
    }

    var bitflux = {
        app: app
    };

    return bitflux;

}));
//# sourceMappingURL=bitflux.js.map