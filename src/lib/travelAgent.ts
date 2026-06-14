import { get } from 'svelte/store';
import { airports, type airportType, type iata } from './airports';
import { getActiveAirports, IATAtoAirport } from './utils';
import { globals } from './compiler';
type cacheFormat = { order: iata[]; sumTime: number };
type cacheType = { order: airportType[]; sumTime: number };
// Cache for storing pathfinding results
let cache: { [key: string]: cacheFormat } = {};
// Convert a returned cache to cacheFormat
function format(cacheType: cacheType): cacheFormat {
	let cacheFormat: cacheFormat = { order: [], sumTime: -cacheType.sumTime };
	cacheType.order.forEach((v) => {
		cacheFormat.order.push(v.IATA);
	});
	return cacheFormat;
}



// find path from cache or add to cache if necessary
export function findPath(airportA: airportType, airportB: airportType): cacheFormat {
	// Create a unique key for each pair of airports
	let key = `${airportA.IATA}-${airportB.IATA}`;
	let reversedKey = `${airportB.IATA}-${airportA.IATA}`;

	// If the result is in the cache, return it
	if (cache[key]) {
		return cache[key];
	}
	if(cache[reversedKey]) {
		cache[key] = {
			sumTime: cache[reversedKey].sumTime,
			order: cache[reversedKey].order.toReversed()
		}
		return cache[key];
	}
	// Otherwise, calculate the path
	let path = calculatePath(airportA, airportB);

	// Store the result in the cache
	cache[key] = format(path);

	return cache[key];
}
// Resets cache and initiates a rerun
export function resetCache() {
	// Delete cache
	cache = {};
	// Create airports list
	const validAirports = getActiveAirports(get(airports), globals.level);
	validAirports.forEach((airportA: airportType) => {
		validAirports.forEach((airportB: airportType) => {
			if (airportA.IATA < airportB.IATA) return;
			findPath(airportA, airportB);
		});
	});
}

class MinPriorityQueue {
	heap: {element: queueElem, priority: number}[] = [];
	constructor() {
		this.heap = [];
	}

	// Insert an element with a given priority
	enqueue(
		element: queueElem,
		priority: number
	) {
		this.heap.push({ element, priority });
		this.bubbleUp();
	}

	// Remove and return the element with the highest priority (lowest value)
	dequeue() {
		if (this.heap.length === 0) {
			return null;
		}
		const min = this.heap[0];
		const end = this.heap.pop();
		if (this.heap.length > 0) {
			this.heap[0] = end;
			this.bubbleDown();
		}
		return min;
	}

	// Check if the queue is empty
	isEmpty() {
		return this.heap.length === 0;
	}

	// Bubble up the last element to maintain the heap property
	bubbleUp() {
		let index = this.heap.length - 1;
		const element = this.heap[index];

		while (index > 0) {
			const parentIndex = Math.floor((index - 1) / 2);
			const parent = this.heap[parentIndex];

			if (element.priority >= parent.priority) {
				break;
			}

			this.heap[index] = parent;
			index = parentIndex;
		}
		this.heap[index] = element;
	}

	// Bubble down the root element to maintain the heap property
	bubbleDown() {
		let index = 0;
		const length = this.heap.length;
		const element = this.heap[0];

		while (true) {
			const leftChildIndex = 2 * index + 1;
			const rightChildIndex = 2 * index + 2;
			let leftChild: { priority: number }, rightChild: { priority: number };
			let swap = null;

			if (leftChildIndex < length) {
				leftChild = this.heap[leftChildIndex];
				if (leftChild.priority < element.priority) {
					swap = leftChildIndex;
				}
			}

			if (rightChildIndex < length) {
				rightChild = this.heap[rightChildIndex];
				if (
					(swap === null && rightChild.priority < element.priority) ||
					(swap !== null && rightChild.priority < leftChild.priority)
				) {
					swap = rightChildIndex;
				}
			}

			if (swap === null) {
				break;
			}

			this.heap[index] = this.heap[swap];
			index = swap;
		}
		this.heap[index] = element;
	}
}

function calculatePath(airportA: airportType, airportB: airportType): cacheType {
	try {
		if (airportA.gates == 0 || airportB.gates == 0) {
			return { order: [], sumTime: -1 };
		}

		let queue = new MinPriorityQueue(); // Use a priority queue
		queue.enqueue({ airport: airportA, time: 0, order: [] }, 0);
		let visited = new Map(); // Store the shortest time to each airport

		while (!queue.isEmpty()) {
			let { airport, time, order } = queue.dequeue().element;

			// We made it!
			if (airport.IATA === airportB.IATA) {
				return { order: [...order, airportB], sumTime: time};
			}

			// Use better route if possible
			if (visited.has(airport.IATA) && visited.get(airport.IATA) <= time) {
				continue; // Skip if we have already found a better path
			}
			visited.set(airport.IATA, time);

			// We might have already found the best route from this point, we can just use that
			let possibleCacheKey = `${airport.IATA as string}-${airportB.IATA}`
			if(cache[possibleCacheKey] && cache[possibleCacheKey].order.length) {
				const timeThroughCache = time + cache[possibleCacheKey].sumTime;
				const cacheOrder = cache[possibleCacheKey].order.map(IATAtoAirport);
				cacheOrder.pop() // Remove the end because we are adding it back later
				queue.enqueue({
					airport: airportB,
					time: timeThroughCache,
					order: [...order, ...cacheOrder]
				}, timeThroughCache)

				continue
			}

			for (let gate of Object.values(airport.connections)) {
				if(gate.gates == 0 || gate.location == airport.IATA) continue;
				const nextAirport = IATAtoAirport(gate.location);
				const newTime = time + gate.speed;
				const newOrder = [...order, airport];

				if (!visited.has(gate.location) || newTime < visited.get(gate.location)) {
					queue.enqueue({ airport: nextAirport, time: newTime, order: newOrder }, newTime);
				}
			}
		}

		return { order: [], sumTime: -1 };
	} catch (err) {
		console.error(err);
		return { order: [], sumTime: -1 };
	}
}
type queueElem = { airport: airportType, time: number, order: airportType[] }