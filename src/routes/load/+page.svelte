<script lang="ts">
	import Loading from '$lib/loading.svelte';
	import { airports, getAirports, type airportType, type iata } from '$lib/airports';
	import { IATAtoAirport } from '$lib/utils';
	import { removeEntryByID } from '$lib/utils/basic';
	import { onMount } from 'svelte';
	const scale = 10 ** 2;
	function readCSV(csv: string) {
		return csv.split('\n').map((a) => a.split(',').map((a) => (isNaN(Number(a)) ? a : Number(a))));
	}
	type file = {
		state: string;
		IATA: string;
		location: string;
		latitude: number;
		longitude: number;
		airport: airportType;
		enplanements: number;
		complete: boolean;
		type: string;
	};
	async function loadFile(): Promise<file[]> {
		airports.set(getAirports());
		const response = await fetch(`/enplanements08.csv`);
		const CSV = readCSV(await response.text());
		const geo = await readGeo();
		let returnArray = [];
		let i = 0;
		$airports.forEach(airport => {
			if(geo[airport.IATA]) {
				if(airport.latitude != geo[airport.IATA][1] || airport.longitude != geo[airport.IATA][0])
				console.log(airport.IATA, ...geo[airport.IATA])
			} else console.log(airport.IATA, undefined)
		});
		for (let row of CSV) {
			if (!i) {
				i++;
				continue;
			}

			// [STATE, FAA, TOWN, AIRPORT NAME, TYPE, ENP]
			if (!row[0]) continue;
			let ENPfactor =
				Number(row[5]) > 2500
					? Math.round(Number(row[5]) / 1000) / 1000
					: Math.round(Number(row[5]) / 100) / 10000;
			let airport = IATAtoAirport(row[1] as iata);
			if (Number(row[5]) > 1000 || airport)
				if (airport && geo[row[1]]) {
					airport.latitude = geo[row[1]][1];
					airport.longitude = geo[row[1]][0];
				} else {
					let possibleAirports = $airports.filter((v) => v.location == row[2] && v.state == row[0]);
					if (possibleAirports.length == 1) airport = possibleAirports[0];
				}
			returnArray.push({
				state: row[0],
				IATA: row[1],
				location: row[2],
				latitude: geo[row[1]]?.[1] ?? null,
				longitude: geo[row[1]]?.[0] ?? null,
				airport,
				enplanements: ENPfactor,
				complete: airport?.enplanements == ENPfactor,
				type: row[4]
			});

			i++;
			//await delay(1)
		}
		return returnArray;
	}
	async function readGeo() {
		const response = await fetch(`/airports.geojson`);
		const json: GeoJSON.FeatureCollection = await response.json();
		const items: Record<string, [number, number]> = {};
		for (const feature of json.features) {
			items[feature.properties.IDENT] = [
				Math.round((feature.geometry as GeoJSON.Point).coordinates[0] * scale) / scale,
				Math.round((feature.geometry as GeoJSON.Point).coordinates[1] * scale) / scale
			];
		}
		return items;
	}
	function simplifyAirportsSet() {
		allAirports = allAirports
			.map((airport, i) => {
				if (assignedIATAs[i]) {
					airport.IATA = assignedIATAs[i];
					airport.airport = IATAtoAirport(assignedIATAs[i]);
				}
				return airport;
			})
			.filter((a) => a.airport);
		step++;
	}
	let allAirports: file[] = [];
	let step = 0;
	let assignedIATAs = [];
	let key = Number.MIN_SAFE_INTEGER + 1;
	onMount(async () => {
		allAirports = await loadFile();
		step = 1;
	});
	function addAirport(airport: airportType) {
		allAirports.push({
			state: airport.state,
			IATA: airport.IATA,
			location: airport.location,
			airport: airport,
			enplanements: airport.enplanements,
			type: 'N/A',
			complete: false,
			latitude: Math.round(airport.latitude * scale) / scale,
			longitude: Math.round(airport.longitude * scale) / scale
		});
	}
	function assignNew(i: number) {
		let airport = allAirports[i];
		allAirports[i].airport = {
			location: airport.location,
			state: airport.state as any,
			IATA: airport.IATA as iata,
			enplanements: airport.enplanements,
			longitude: airport.longitude,
			latitude: airport.latitude
		};
	}
	function removeAirport(i: number) {
		allAirports = removeEntryByID(allAirports, i);
		key++;
	}
	function getDiff(a: number, b: number) {
		return Math.round((Math.abs(a - b) / b) * 100);
	}
	async function convert() {
		let airports: Partial<airportType>[] = allAirports.map((airport) => {
			let i = airport.airport;
			return {
				location: i.location,
				IATA: i.IATA,
				state: i.state,
				enplanements: airport.enplanements,
				latitude: i.latitude,
				longitude: i.longitude,
				nearbyAirports: i.nearbyAirports,
				qrImpact: i.qrImpact
			};
		});
		await navigator.clipboard.writeText(JSON.stringify(airports));
		alert('Copied!');
	}
</script>

<div class="p-4 text-center w-full">
	<h1 class="text-4xl">Planelooly –  US File Loader (Step {step} of 3)</h1>
	{#if step == 0}
		<Loading />
	{:else if step == 1}
		<h2 class="text-2xl">Airports not identified</h2>
		{#each allAirports as airport, i}
			{#if !airport.airport && airport.type != 'GA'}
				<div class="flex p-4 gap-4 items-center">
					<p class="font-bold">
						{airport.IATA} ({airport.location}, {airport.state}; Popularity Factor = {airport.enplanements})
					</p>
					<p>{IATAtoAirport(assignedIATAs[i]) ? IATAtoAirport(assignedIATAs[i]).location : ''}</p>
					<input class="input ml-auto" bind:value={assignedIATAs[i]} title="IATA code" />
					<button on:click={() => assignNew(i)} class="btn-compact color-btn-blue">Add</button>
					<button on:click={() => removeAirport(i)} class="btn-compact color-btn-red">Remove</button
					>
				</div>
			{/if}
		{/each}
		<button on:click={simplifyAirportsSet} class="btn-no-margins color-btn-green w-3/4"
			>Continue</button
		>
	{:else if step == 2}
		<h2 class="text-2xl">Airports that didn't appear</h2>
		<table class="w-full text-left">
			<tr class="bg-blue-200 dark:bg-blue-700">
				<th class="w-full">Location</th>
				<th>Enplanements</th>
				<th />
			</tr>
			{#each $airports as airport}
				{#if !allAirports.filter(v=>airport.IATA).length}
					<tr>
						<td class="font-bold">{airport.IATA} ({airport.location}, {airport.state})</td>
						<td>{airport.enplanements}</td>
						<td
							><button on:click={() => addAirport(airport)} class="btn-compact color-btn-blue"
								>Add</button
							></td
						>
					</tr>
				{/if}
			{/each}
		</table>
		<button
			on:click={() => {
				step = 3;
				allAirports = allAirports.sort(
					(a, b) =>
						getDiff(b.enplanements, b.airport.enplanements) -
						getDiff(a.enplanements, a.airport.enplanements)
				);
			}}
			class="btn-no-margins color-btn-green w-3/4">Continue</button
		>
	{:else if step == 3}
		<h2 class="text-2xl">Finishing Touches</h2>
		<table class="w-full">
			<thead>
				<tr class="bg-blue-200 dark:bg-blue-700">
					<th>IATA</th>
					<th>Location</th>
					<th>Difference</th>
					<th><label for="enp">Enplanements (New)</label></th>
					<th>Enplanements (Current)</th>
					<th><label for="qI">QueryImpact</label></th>
					<th />
				</tr>
			</thead>
			<tbody>
				{#key key}
					{#each allAirports as airport, i}
						{#if !airport.complete}
							<tr>
								<td>{airport.airport.IATA}</td>
								<td>{airport.airport.location}, {airport.airport.state}</td>
								<td
									>{airport.enplanements > airport.airport.enplanements
										? '↑'
										: airport.enplanements == airport.airport.enplanements
										? '→'
										: '↓'}
									{String(getDiff(airport.enplanements, airport.airport.enplanements)).padStart(
										2,
										'0'
									) + '%'}</td
								>
								<td>
									<input
										bind:value={airport.enplanements}
										aria-labelledby="enp"
										class="input my-1"
										type="number"
										step="0.001"
									/>
								</td>
								<td>{airport.airport.enplanements}</td>
								<td>
									<input
										bind:value={airport.airport.qrImpact}
										aria-labelledby="qI"
										class="input w-20"
										type="number"
										step="0.5"
									/>
								</td>
								<td>
									<button on:click={() => removeAirport(i)} class="btn-compact color-btn-red"
										>Remove</button
									>
									<button
										on:click={() => (airport.enplanements = airport.airport.enplanements)}
										class="btn-compact color-btn-yellow">Reset Enp</button
									>
									<button
										on:click={() => (airport.complete = true)}
										class="btn-compact color-btn-green">Done</button
									>
								</td>
							</tr>
						{/if}
					{/each}
				{/key}
			</tbody>
		</table>
		<button on:click={convert} class="btn-no-margins color-btn-green w-2/3">Copy!</button>
	{/if}
</div>
