# Setup

- In .env set DWB_API_URL=https://testdrive.donordrive.com/api/1.3
- In controls set fundraising event to https://events.doctorswithoutborders.org/participants/4715

## Testing donation messages

- In .env set OPENAI_API_KEY. Names and messages are moderated before they're shown; without a
  key, moderation gives up after a few retries (about 15s) and the donation shows as Anonymous
  with no message
- Make a donation to the test participant. The overlay polls every 16s, so it shows within about
  16s: the latest donation card turns peach for 10s, then after 30s with nothing new it fades to
  the recent donations list
- To replay donations the overlay has already shown: in the overlay's devtools, set
  `lastDonationProcessedByMessagesId` in the `fundraisingState` local storage entry to the id of
  an earlier donation (ids are in its `donations` list), then reload. The cards step through
  every donation after it as if they were new
- A cleared or unknown id doesn't replay anything: the overlay starts at the latest donation

## Testing RTD

- In connections set the jf relay websocket plugin token, and enable fundraising RTD
- RTD runs from the controls page, so keep it open
- Quickest: in fundraising's advanced settings, tick "test donations". A fake $10-45 donation in
  DWB's api format, with a random RTD effect in its message, comes in every 0-30s (logged in the
  controls' console). It goes through the same conversion, OpenAI moderation, overlay donation
  cards and RTD as a real one, on every page open in the same browser. It isn't saved and the
  checkbox resets on reload. It skips DWB's api, so it doesn't test fetching or caching, and the
  totals and rocket bar don't move
- Before going live, set `TEST_DONATIONS_ALLOWED` to false in
  src/lib/api/dwb/dwb-test-donations.svelte.ts: it hides the checkbox and ignores fake donations
- Or, to test a real donation's path: enable the commented out lines in
  src/lib/fundraising-rtd.ts, and set a donation's amount to at least 20 and the message to
  'rtd snail' for example
