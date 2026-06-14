<script lang="ts">
	import AirportModal from '$lib/airportModal.svelte';
	import { airports } from '$lib/airports';
	import { compiler, globals } from '$lib/compiler';
	import { addGate } from '$lib/gates';
	import { setLevel } from '$lib/level';
	import MainColumn from '$lib/mainColumn.svelte';
	import { tick } from '$lib/tick';
	import MapModal from '$lib/map/modal.svelte';
	import { delay } from '$lib/utils/basic';
	let points = 100;
	let gates = points * 2;
	let startTime: number, tickTime: number, lastTickTime: number;
	let ticks: number = 0;
	async function test() {
		console.log("Running tests");
		ticks = 0;
		setLevel(58);
		compiler();
		for (let i = 0; i < $airports.length; i++) {
			if(i == 0) console.log($airports[i]);
			if(i < points) $airports[i].queryResult = -i;
			else $airports[i].queryResult = 2 * i
		}


		tick();
		console.log($airports);
		await delay(1);
		startTime = Date.now();
		for (let i = 0; i < gates; i++) {
			const airportA = Math.floor(Math.random() * points);
			const airportB = Math.floor(Math.random() * (points - 1));
			if (airportB >= airportA) {
				addGate($airports[airportA], $airports[airportB + 1], true);
			} else {
				addGate($airports[airportA], $airports[airportB], true);
			}
			globals.tokens += 2;
		}
		console.log("Added gates");
		await delay(1);
		tickTime = Date.now();
		for (; ticks < 100; ticks++) {
			tick();
			lastTickTime = Date.now();
			await delay(1);
		}
		console.log($airports);
	}
	let airportID = 0;
</script>

{#if tickTime}
	{@const time = lastTickTime - tickTime}
	{@const gateTime = tickTime - startTime}
	{@const allotment = 100 * 200}
	<table class='neat m-2'>
	<tr>
	<th>Action</th>
	<th>Time</th>
	<th>% Allotment</th>
	</tr>
		<tr><td>Adding {gates} gates</td> <td>{gateTime.toLocaleString()}ms</td><td>{Math.round(
			(gateTime / allotment) * 100
		)}%</td></tr>
		<tr><td>{ticks} ticks</td> <td>{time.toLocaleString()}ms</td><td>{Math.round(
			(time / allotment) * 100
		)}%</td></tr>
		<tr><td class='font-bold'>Total</td> <td>{(time + gateTime).toLocaleString()}ms</td><td>{Math.round(
			((time + gateTime) / allotment) * 100
		)}%</td></tr>
	</table>
{:else}
<button class='btn color-btn-game-primary' on:click={test}>Test</button>
{/if}
<div class="grid grid-cols-2 gap-8 p-8 h-min">
	{#if $airports.length && startTime}
		<AirportModal bind:airportID />
		<div class="flex flex-col">
			<div class="w-full md:w-auto h-[50vh] min-w-[50%] overflow-y-scroll">
				<MainColumn bind:airportID />
			</div>
			<div class="h-[50vh] sticky bottom-2">
				<MapModal bind:airportID />
			</div>
		</div>
	{/if}
</div>
