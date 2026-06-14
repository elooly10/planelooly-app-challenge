import { get } from 'svelte/store';
import { globals, compiler } from './compiler';
import { airports, type airportType } from './airports';
import { addTokens, findSpeed, getActiveAirports, haversineDistance, mapUpdatesClear } from './utils';
import { resetCache } from './travelAgent';
import { setFlights } from './flights';
import { browser } from '$app/environment';
import { mean } from './utils/basic';
let loading = true;
let lost = false;
export let lastTime = 0;
function incrementTime() {
	const points = get(airports);
	const airportCentral = points.filter(v => v.IATA === globals.centralAirport)[0];
	globals.day += globals.increment / 500;
	globals.level =
		globals.day * 0.85 +
		Math.max(0, airportCentral.queryResult, points[2].queryResult);
	if (Math.floor(globals.day) !== Math.floor(lastTime) && globals.increment) {
		globals.tokens += addTokens(airportCentral, points);
		console.log('Updated Tokens');
	}
	if (globals.day >= globals.starLevels[globals.stars]) {
		globals.stars++;
	}
}
function increasePopulation() {
	let gotAirports = get(airports);
	// If there is a new airport, assign it population
	const defaultPopulationBase =
		mean(...getActiveAirports(gotAirports, globals.level).map(v => v.enplanements)) /
		8 +
		12.2;
	const newAirports: airportType[] = [];
	gotAirports.forEach((airport) => {
		/* Well, we need to set the population somewhere */
		if (globals.level >= airport.queryResult) {
			/* Set population */
			if (
				(typeof airport.population !== 'number' || isNaN(airport.population)) &&
				airport.queryResult >= 0
			) {
				console.log(`New airport: ${airport.IATA}`);
				mapUpdatesClear.set(get(mapUpdatesClear) + 1);
				resetCache();
			}
			try {
				// Add to the population of an airport and change its growth rate (in interest view) to match.
				let growthRate =
					0.4 *
					(globals.day / 16 + 0.9375) *
					((globals.level - airport.queryResult) * 0.002 +
						Math.sqrt(airport.enplanements) * 0.1 +
						0.1);
				if (typeof airport.population === 'number' && !isNaN(airport.population)) {
					const initPopulation = Math.round(airport.population);
					airport.population += growthRate * globals.increment
					airport.unassignedTravelers = Math.round(airport.population) - initPopulation;
				} else {
					airport.population = defaultPopulationBase + Math.sqrt(airport.enplanements) * 2
					airport.unassignedTravelers = Math.round(airport.population);
					newAirports.push(airport);
				}
				airport.growthRate = 500 * growthRate;
			} catch (error) {
				console.error(`Error during population assignment: ${error}`);
			}
		}
	});
	return newAirports
}

function calculateTravelers(
	airportA: airportType,
	airportB: airportType,
	meanEnplanements: number
) {
	const distance = Math.max(
		haversineDistance(airportA.latitude, airportA.longitude, airportB.latitude, airportB.longitude),
		5000
	);
	// Even if Buffalo is closer, you still are more likely to want to fly to New York City
	const popularityFactor =
		airportB.enplanements / meanEnplanements + Math.sqrt(airportB.enplanements) / 3;
	// But if Spokane is way closer than New York City, you'll end up wanting to go there!
	const distanceFactor = Math.max(Math.min(250 - 0.025 * distance, distance / 2) / 70, 0);
	const value = 2 * popularityFactor + distanceFactor;
	if (isNaN(value)) {
		return isNaN(popularityFactor) ? 1 : popularityFactor;
	}
	return Math.max(value, 0);
}
function addTravelers(newAirports: airportType[]) {
	const activeAirports = getActiveAirports(get(airports), globals.level);
	const totalEnplanements = activeAirports.map(v => v.enplanements).reduce((a, b) => a + b, 0);
	activeAirports.forEach((airport: airportType) => {
		for(const newAirport of newAirports) {
			if(newAirport == airport) continue;
			const speed = findSpeed(airport, newAirport);
			airport.connections[newAirport.IATA] = {
				location: newAirport.IATA,
				travelers: 0,
				interest: 0,
				gates: 0,
				speed
			}
			if(!newAirport.connections[airport.IATA]) {
				newAirport.connections[airport.IATA] = {
					location: airport.IATA,
					travelers: 0,
					interest: 0,
					gates: 0,
					speed
				}
			}
		};
		let sumInterests = 0;
		for(const airportB of activeAirports) {
			if (airportB == airport) continue;
			const amount = calculateTravelers(
				airport,
				airportB,
				totalEnplanements - airport.enplanements
			)
			sumInterests += amount
			airport.connections[airportB.IATA].interest = amount
		};
		// #2: Assign
		// For each traveler, choose a random airport
		let rolls = new Array(airport.unassignedTravelers).fill(0).map(()=>Math.random() * sumInterests).sort((a, b) => b - a);
		let viewed = 0;
		for(const airportB of activeAirports) {
			if (airportB == airport) continue;
			viewed += airport.connections[airportB.IATA].interest;
			airport.connections[airportB.IATA].interest /= sumInterests; // So it is a percent
			while(viewed > rolls[rolls.length - 1]) {
				rolls.splice(rolls.length - 1, 1);
				airport.connections[airportB.IATA].travelers++;
			}
		};
		airport.unassignedTravelers = 0;
		// used if TSM = 'gates'

	});
}
function checkForLoss() {
	if (
		Math.round(
			Math.max(
				...get(airports).filter(v => v.queryResult <= globals.level).map(v => v.population)
			)
		) >= 200 &&
		browser &&
		!lost
	) {
		lost = true;
		clearInterval(time);
		globals.increment = 0;
	}
	return lost;
}
export function tick() {
	try {
		if (globals.increment !== 0 || loading) {
			incrementTime(); // Move time up, add tokens, add stars, etc.
			const newAirports = increasePopulation(); // Add new people to the airports that deserve them.
			addTravelers(newAirports); // Add to travelers
			if (!checkForLoss()) setFlights(); // Land flights
			lastTime = globals.day;
			loading = false;
		}
		checkForLoss();
	} catch (values) {
		if (values.important ?? false) alert(values);
		console.error(values);
	}
}
let time = null;
export function clearTime() {
	if (time) clearInterval(time);
}
export function startTime() {
	compiler();
	console.log('Initiating main play interval');
	loading = true;
	time = null;
	time = setInterval(tick, 200);
	tick();
}
