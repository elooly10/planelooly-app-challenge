import { airports, type airportType, getAirports, type iata } from './airports';
import { filterEnplanements, haversineDistance, IATAtoAirport } from './utils';
import { shuffle, sortAlphabetically } from './utils/basic';
export interface Level {
	number: number | string;
	name: string;
	airportsList: () => void;
	compiler: (airports: airportType[], central: airportType, details?: any) => airportType[];
	starterAirport: () => iata;
	hardness: number;
	image: string;
	tutorial?: boolean;
	ratings?: number[];
}
export let mode: Level = null;
/*
 * Values:
 * 0: What type is it
 * STATE: State-based
 * POP: Population based, only (e.g. always chooses biggest airport)
 * DIST: Distance based, only (e.g. always chooses closest airport)
 * 1: What state we're in (e.g. ID)
 * 2: What airport is our base (e.g. BOI)
 */
function filterState(state: string) {
	return (airport: airportType) => {
		if (airport.state === state) return true;
		return false;
	}
}
export function regularGameplay(airportsList: airportType[]) {
	try {
		shuffle(airportsList);
		/* Instead of just picking a random airport, Its prone to choosing the biggest. */
		function findSumAG() {
			let c = 0;
			airportsList.forEach((airport) => {
				c += airport.enplanements;
			});
			return c;
		}
		const sumAG = findSumAG();
		const choiceID = Math.random() * sumAG;
		let sumGame = 0;
		// We actually need to choose something, right?
		for (let j = 0; j < airportsList.length; j++) {
			sumGame += airportsList[j].enplanements;
			// console.table({index: j, sumAG: sumAG, sumGame: sumGame, choiceID: choiceID, shouldGo: choiceID<=sumGame});
			if (choiceID <= sumGame) {
				return airportsList[j].IATA;
			} else {
				continue;
			}
		}
	} catch (error) {
		console.error(error);
	}
}
// Render Functions
export function STATE(
	airports: airportType[],
	central: airportType,
	details: {
		useNAsorting?: boolean;
		popularityLevel?: number;
		farDistance?: number;
		useNE?: boolean;
	} = {}
) {
	let airportsPreFinished = [central.IATA];
	details = Object.assign(
		{
			useNAsorting: true,
			popularityLevel: 0.1375,
			farDistance: 0.8,
			useNE: true
		},
		details
	);
	airports = shuffle(
		airports
	);
	for (const airport of airports) {
		const distance = haversineDistance(
			central.latitude,
			central.longitude,
			airport.latitude,
			airport.longitude
		);
		const toFactor = (distance) => Math.max(60 - 0.5 * distance, distance / 30);
		const distanceFactor = toFactor(distance);
		const qrAdjustment = airport.qrImpact ? 2 ** -airport.qrImpact : 1;
		if (airport.queryResult) continue;
		if (airport.nearbyAirports && details.useNAsorting && distance > 100) {
			// Give a little mixup + stop the four NY airports but two others glitch
			let places = [airport];
			airport.nearbyAirports.forEach((nearbyAirportIATA) => {
				if (!airportsPreFinished.includes(nearbyAirportIATA) && central.IATA !== nearbyAirportIATA && IATAtoAirport(nearbyAirportIATA)) places.push(IATAtoAirport(nearbyAirportIATA));
			});
			places = places.sort((a, b) => a.enplanements - b.enplanements).filter((a) => a);
			function getIndex(IATA: string) {
				return airports.findIndex((a) => a.IATA == IATA);
			}
			// Use level selection logic
			const choice = regularGameplay(places);
			for (let j = 0; j < places.length; j++) {
				if (airports[getIndex(places[j].IATA)].queryResult) continue;
				const distanceToLocal = haversineDistance(
					central.latitude,
					central.longitude,
					places[j].latitude,
					places[j].longitude
				);
				let qR =
					details.farDistance *
					qrAdjustment *
					(0.7 * distanceFactor -
						(0.0002 * distanceToLocal + details.popularityLevel) * airport.enplanements ** 1.1);

				if (choice == places[j].IATA) {
					airports[getIndex(places[j].IATA)].queryResult = qR;
				} else {
					airports[getIndex(places[j].IATA)].queryResult = Math.max(
						qR * (2 + 2 * Math.random() * airport.nearbyAirports.length),
						qR + 50
					);
				}
			}
			airportsPreFinished.push(...airport.nearbyAirports);
			continue;
		}
		else airport.queryResult =
			airport === central
				? 0
				: details.farDistance *
				qrAdjustment *
				(0.7 * distanceFactor -
					(0.0002 * distance + details.popularityLevel) * airport.enplanements ** 1.1);
	}
	airports.sort((a, b) => a.queryResult - b.queryResult);
	return airports;
}
function FARSTATE(a: airportType[], c: airportType, d: any = {}) {
	d.farDistance = 0.3;
	let airports = STATE(a, c, d);
	let qr = -1;
	airports.forEach(v=> {
		v.queryResult = qr;
		qr += 0.5;
	})
	return airports;
}
function RAND(
	airports: airportType[],
	central: airportType,
	details: { popularityLevel?: number; favoritism?: string[]; startingAirports?: number } = {}
) {
	let nd = details.favoritism ?? [];
	details = Object.assign({ popularityLevel: 0.005, favoritism: [], startingAirports: 3 }, details);
	let stack = -details.startingAirports / (10 / 3);
	function sort(a, b) {
		if (nd.includes(a.IATA) && !nd.includes(b.IATA))
			return (
				Math.random() * 3 -
				1.5 +
				(b.enplanements - a.enplanements) * details.popularityLevel -
				0.667
			);
		else if (!nd.includes(a.IATA) && nd.includes(b.IATA))
			return (
				Math.random() * 3 -
				1.5 +
				(b.enplanements - a.enplanements) * details.popularityLevel +
				0.667
			);
		else
			return Math.random() * 3 - 1.5 + (b.enplanements - a.enplanements) * details.popularityLevel;
	}
	shuffle(airports)
		.sort(sort)
		.forEach((v, i) => {
			airports[i].queryResult = airports[i] === central ? 0 : (stack += 0.3);
		});
	return airports;
}
function POP(airports: airportType[], central: airportType) {
	airports.forEach((airport, i) => {
		airport.queryResult = (central.enplanements - airport.enplanements) * 0.8;
	});
	return airports;
}

function ALPHA(airports: airportType[], central: airportType) {
	airports.sort((a, b) => sortAlphabetically(a.IATA, b.IATA));
	let centralIndex = airports.indexOf(central);
	for(let i = 0; i < airports.length; i++) {
		if(i < centralIndex) {
			airports[i].queryResult = (centralIndex - i + airports.length) * 0.3
		} else {
			airports[i].queryResult = (i - centralIndex) * 0.3
		}
	}
	return airports;
}

export const levels: Level[] = [
	{
		number: 'T',
		name: 'Tutorial',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () => 'BOI',
		hardness: 1.75,
		image: '/icons/CC.svg',
		tutorial: true,
		ratings: [1, 5, 10]
	},
	{
		number: 1,
		name: 'Alabama',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('AL'))),
		hardness: 1,
		image: '/icons/AL.svg',
		ratings: [1.5, 6, 10]
	},
	{
		number: 2,
		name: 'Alaska',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('AK'))),
		hardness: 1,
		image: '/icons/AK.svg',
		ratings: [3, 13, 23]
	},
	{
		number: 3,
		name: 'American Samoa',
		airportsList: () => airports.set(getAirports()),
		compiler: FARSTATE,
		starterAirport: () => 'PPG',
		hardness: 0.9,
		image: '/icons/AS.svg',
		ratings: [4, 11, 16]
	},
	{
		number: 4,
		name: 'Arizona',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('AZ'))),
		hardness: 1,
		image: '/icons/AZ.svg',
		ratings: [1.5, 10, 15]
	},
	{
		number: 5,
		name: 'Arkansas',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('AR'))),
		hardness: 1,
		image: '/icons/AR.svg',
		ratings: [1.5, 5, 9]
	},
	{
		number: 6,
		name: 'California',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('CA'))),
		hardness: 1.1,
		image: '/icons/CA.svg',
		ratings: [1.5, 11.5, 21]
	},
	{
		number: 7,
		name: 'Colorado',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(
				getAirports()
					.filter(filterState('CO'))
					.map((a) => {
						if (a.IATA == 'DEN') a.enplanements = 10;
						return a;
					})
			),
		hardness: 1,
		image: '/icons/CO.svg',
		ratings: [1, 7, 12]
	},
	{
		number: 8,
		name: 'Connecticut',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('CT'))),
		hardness: 1.05,
		image: '/icons/CT.svg',
		ratings: [1, 4, 10]
	},
	{
		number: 9,
		name: 'DC',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('DC'))),
		hardness: 1.075,
		image: '/icons/DC.svg',
		ratings: [0.5, 4, 8]
	},
	{
		number: 10,
		name: 'Delaware',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () => 'ILG',
		hardness: 1.075,
		image: '/icons/DE.svg',
		ratings: [1.5, 5.5, 9]
	},
	{
		number: 11,
		name: 'Florida',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('FL'))),
		hardness: 1.075,
		image: '/icons/FL.svg',
		ratings: [1.5, 11.5, 18]
	},
	{
		number: 12,
		name: 'Georgia',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(
				getAirports()
					.filter(filterState('GA'))
					.map((a) => {
						if (a.IATA == 'ATL') a.enplanements = 10;
						return a;
					})
			),
		hardness: 1.025,
		image: '/icons/GA.svg',
		ratings: [2, 6, 10]
	},
	{
		number: 13,
		name: 'Guam',
		airportsList: () => airports.set(getAirports()),
		compiler: FARSTATE,
		starterAirport: () => 'GUM',
		hardness: 0.6,
		image: '/icons/GU.svg',
		ratings: [8, 16, 30]
	},
	{
		number: 14,
		name: 'Hawaii',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('HI'))),
		hardness: 0.9,
		image: '/icons/HI.svg',
		ratings: [1, 10, 80] // = # of airports: 5, 10, 20
	},
	{
		number: 15,
		name: 'Idaho',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('ID'))),
		hardness: 0.9,
		image: '/icons/ID.svg',
		ratings: [3, 8, 13] // = # of airports: 5, 20, 40
	},
	{
		number: 16,
		name: 'Illinois',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('IL'))),
		hardness: 1.025,
		image: '/icons/IL.svg',
		ratings: [1, 4, 7]
	},
	{
		number: 17,
		name: 'Indiana',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('IN'))),
		hardness: 1.025,
		image: '/icons/IN.svg',
		ratings: [1, 4.5, 9]
	},
	{
		number: 18,
		name: 'Iowa',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('IA'))),
		hardness: 1,
		image: '/icons/IA.svg',
		ratings: [1, 5.5, 10]
	},
	{
		number: 19,
		name: 'Kansas',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('KS'))),
		hardness: 1,
		image: '/icons/KS.svg',
		ratings: [1, 6.5, 11]
	},
	{
		number: 20,
		name: 'Kentucky',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('KY'))),
		hardness: 1,
		image: '/icons/KY.svg',
		ratings: [1, 5, 9]
	},
	{
		number: 21,
		name: 'Louisiana',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('LA'))),
		hardness: 1,
		image: '/icons/LA.svg',
		ratings: [1, 7, 12]
	},
	{
		number: 22,
		name: 'Maine',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('ME'))),
		hardness: 1,
		image: '/icons/ME.svg',
		ratings: [1, 5, 13]
	},
	{
		number: 23,
		name: 'Maryland',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MD'))),
		hardness: 1.1,
		image: '/icons/MD.svg',
		ratings: [1, 5.5, 10]
	},
	{
		number: 24,
		name: 'Massachusetts',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MA'))),
		hardness: 1.1,
		image: '/icons/MA.svg',
		ratings: [1, 7.5, 17]
	},
	{
		number: 25,
		name: 'Michigan',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MI'))),
		hardness: 1,
		image: '/icons/MI.svg',
		ratings: [1.5, 6, 10]
	},
	{
		number: 26,
		name: 'Minnesota',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MN'))),
		hardness: 1.05,
		image: '/icons/MN.svg',
		ratings: [1, 5, 11]
	},
	{
		number: 27,
		name: 'Mississippi',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MS'))),
		hardness: 1,
		image: '/icons/MS.svg',
		ratings: [1.5, 6.5, 12]
	},
	{
		number: 28,
		name: 'Missouri',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MO'))),
		hardness: 1,
		image: '/icons/MO.svg',
		ratings: [1, 5, 9]
	},
	{
		number: 29,
		name: 'Montana',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MT'))),
		hardness: 1,
		image: '/icons/MT.svg',
		ratings: [1.5, 8.5, 16]
	},
	{
		number: 30,
		name: 'Nebraska',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NE'))),
		hardness: 1,
		image: '/icons/NE.svg',
		ratings: [1, 6, 10]
	},
	{
		number: 31,
		name: 'Nevada',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NV'))),
		hardness: 1,
		image: '/icons/NV.svg',
		ratings: [2.5, 10, 15]
	},
	{
		number: 32,
		name: 'New Hampshire',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NH'))),
		hardness: 1.05,
		image: '/icons/NH.svg',
		ratings: [1, 4.5, 11.5]
	},
	{
		number: 33,
		name: 'New Jersey',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(
				getAirports()
					.filter(filterState('NJ'))
					.map((a) => {
						if (a.IATA == 'EWR') a.enplanements = 0.425;
						if (a.IATA == 'ACY') a.enplanements = 0.345;
						if (a.IATA == 'TTN') a.enplanements = 0.205;
						if (a.IATA == 'TEB') a.enplanements = 0.025;
						return a;
					})
			),
		hardness: 1.1,
		image: '/icons/NJ.svg',
		ratings: [1, 5, 8.5]
	},
	{
		number: 34,
		name: 'New Mexico',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NM'))),
		hardness: 1,
		image: '/icons/NM.svg',
		ratings: [1, 5, 13]
	},
	{
		number: 35,
		name: 'New York',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NY'))),
		hardness: 1.1,
		image: '/icons/NY.svg',
		ratings: [0.5, 5, 11]
	},
	{
		number: 36,
		name: 'North Carolina',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('NC'))),
		hardness: 1.05,
		image: '/icons/NC.svg',
		ratings: [1, 5, 11]
	},
	{
		number: 37,
		name: 'North Dakota',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('ND'))),
		hardness: 1.05,
		image: '/icons/ND.svg',
		ratings: [1.5, 8.5, 17]
	},
	{
		number: 38,
		name: 'Northern Marianas',
		airportsList: () => airports.set(getAirports()),
		compiler: FARSTATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('MP'))),
		hardness: 0.5,
		image: '/icons/MP.svg',
		ratings: [10, 20, 35]
	},
	{
		number: 39,
		name: 'Ohio',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('OH'))),
		hardness: 1.05,
		image: '/icons/OH.svg',
		ratings: [1, 5, 9]
	},
	{
		number: 40,
		name: 'Oklahoma',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('OK'))),
		hardness: 1,
		image: '/icons/OK.svg',
		ratings: [1.5, 7, 11]
	},
	{
		number: 41,
		name: 'Oregon',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('OR'))),
		hardness: 1,
		image: '/icons/OR.svg',
		ratings: [1.5, 12, 24]
	},
	{
		number: 42,
		name: 'Pennsylvania',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('PA'))),
		hardness: 1.1,
		image: '/icons/PA.svg',
		ratings: [2, 6, 11]
	},
	{
		number: 43,
		name: 'Puerto Rico',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('PR'))),
		hardness: 1,
		image: '/icons/PR.svg',
		ratings: [1, 20, 40]
	},
	{
		number: 44,
		name: 'Rhode Island',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('RI'))),
		hardness: 1,
		image: '/icons/RI.svg',
		ratings: [1, 6, 16]
	},
	{
		number: 45,
		name: 'South Carolina',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('SC'))),
		hardness: 1,
		image: '/icons/SC.svg',
		ratings: [1, 6.5, 13]
	},
	{
		number: 46,
		name: 'South Dakota',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('SD'))),
		hardness: 0.9,
		image: '/icons/SD.svg',
		ratings: [2, 7, 13]
	},
	{
		number: 47,
		name: 'Tennessee',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('TN'))),
		hardness: 1.05,
		image: '/icons/TN.svg',
		ratings: [1, 6.5, 10]
	},
	{
		number: 48,
		name: 'Texas',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('TX'))),
		hardness: 1.1,
		image: '/icons/TX.svg',
		ratings: [1, 8, 15]
	},
	{
		number: 49,
		name: 'Utah',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('UT'))),
		hardness: 1,
		image: '/icons/UT.svg',
		ratings: [1, 5, 10]
	},
	{
		number: 50,
		name: 'Vermont',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('VT'))),
		hardness: 1,
		image: '/icons/VT.svg',
		ratings: [1, 5, 15]
	},
	{
		number: 51,
		name: 'Virginia',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('VA'))),
		hardness: 1.05,
		image: '/icons/VA.svg',
		ratings: [1, 6, 10]
	},
	{
		number: 52,
		name: 'Washington',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('WA'))),
		hardness: 1,
		image: '/icons/WA.svg',
		ratings: [1, 13.5, 25]
	},
	{
		number: 53,
		name: 'West Virginia',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('WV'))),
		hardness: 1,
		image: '/icons/WV.svg',
		ratings: [1, 4, 9]
	},
	{
		number: 54,
		name: 'Wisconsin',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('WI'))),
		hardness: 1,
		image: '/icons/WI.svg',
		ratings: [1, 5, 11]
	},
	{
		number: 55,
		name: 'Wyoming',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(
				getAirports()
					.filter(filterState('WY'))
					.map((a) => {
						if (a.IATA == 'JAC') a.enplanements = 0.075;
						return a;
					})
			),
		hardness: 1,
		image: '/icons/WY.svg',
		ratings: [1, 7, 13]
	},
	{
		number: 56,
		name: 'Virgin Islands',
		airportsList: () => airports.set(getAirports()),
		compiler: STATE,
		starterAirport: () =>
			regularGameplay(getAirports(filterState('VI'))),
		hardness: 1,
		image: '/icons/VI.svg',
		ratings: [1, 30, 50]
	},
	{
		number: 57,
		name: 'Populations',
		airportsList: () => airports.set(getAirports()),
		compiler: POP,
		starterAirport: () => 'JFK',
		hardness: 1.75,
		image: '/icons/PP.svg',
		ratings: [2, 12, 24]
	},
	{
		number: 58,
		name: 'Cross-country',
		airportsList: () => airports.set(getAirports()),
		compiler: RAND,
		starterAirport: () => regularGameplay(getAirports()),
		hardness: 1.1,
		image: '/icons/CC.svg',
		ratings: [1, 15, 24]
	},
	{
		number: 59,
		name: 'Major Airports',
		airportsList: () =>
			airports.set(getAirports(filterEnplanements(0.75))),
		compiler: (a, c) => STATE(a, c, { useNAsorting: true, popularityLevel: 0.2 }),
		starterAirport: () =>
			regularGameplay(getAirports(filterEnplanements(0.75))),
		hardness: 1.25,
		image: '/icons/CC.svg',
		ratings: [1, 18, 35]
	},
	{
		number: 60,
		name: 'Alphabetical',
		airportsList: () =>
			airports.set(getAirports()),
		compiler: ALPHA,
		starterAirport: () =>
			regularGameplay(getAirports()),
		hardness: 1.06,
		image: '/icons/CC.svg',
		ratings: [1, 10, 20]
	},
];
export function setLevel(levelID: number) {
	if (levels[levelID]) {
		mode = levels[levelID];
		return levels[levelID];
	}
	return null;
}
