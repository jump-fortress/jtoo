<script lang="ts">
	import { loadRtdServers, rtdServers } from '$lib/game-server.svelte';
	import { settings } from '$lib/storage.svelte';
	import { onMount } from 'svelte';

	// which game servers RTD effects go to: every server, or the ones picked here

	onMount(() => {
		if (rtdServers.list.length === 0) loadRtdServers();
	});

	const targets = $derived(settings.current.rtdTargetServers);
	// picked servers that aren't listed (renamed, or the list didn't load) stay, so they can be
	// unticked
	const servers = $derived([
		...rtdServers.list,
		...targets
			.filter((t) => !rtdServers.list.some((s) => s.tag === t))
			.map((tag) => ({ tag, name: 'not listed' }))
	]);

	function toggle(tag: string, checked: boolean) {
		settings.current.rtdTargetServers = checked
			? [...targets, tag]
			: targets.filter((t) => t !== tag);
	}
</script>

<fieldset class="flex flex-col gap-1">
	<legend class="mb-1">RTD effects go to</legend>
	<label>
		<input
			class="peer size-4 accent-ctp-lavender"
			type="checkbox"
			checked={targets.length === 0}
			disabled={targets.length === 0}
			onchange={() => (settings.current.rtdTargetServers = [])}
		/>
		<span class="peer-not-checked:text-ctp-overlay2">all servers</span>
	</label>
	{#each servers as server (server.tag)}
		<label>
			<!-- unticking the last picked server leaves none picked, which is all servers -->
			<input
				class="peer size-4 accent-ctp-lavender"
				type="checkbox"
				checked={targets.includes(server.tag)}
				onchange={(e) => toggle(server.tag, e.currentTarget.checked)}
			/>
			<span class="peer-not-checked:text-ctp-overlay2">
				<span class={settings.current.monoFont}>{server.tag}</span>
				<span class="text-ctp-overlay1">{server.name}</span>
			</span>
		</label>
	{/each}
	{#if rtdServers.loading}
		<div class="text-ctp-overlay2">fetching servers…</div>
	{:else if rtdServers.error}
		<div class="text-red-300">
			{rtdServers.error}
			<button class="underline" onclick={loadRtdServers}>retry</button>
		</div>
	{/if}
</fieldset>
