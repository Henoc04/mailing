// Mirrors CLICK_TRACKING_ENABLED in backend/src/services/mergeEngine.service.ts.
// While click tracking is suspended, click counters stay at 0, so the UI
// hides them rather than showing a misleading "0 clics". Flip both together.
export const CLICK_TRACKING_ENABLED = false;
