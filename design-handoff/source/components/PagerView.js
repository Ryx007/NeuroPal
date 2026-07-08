// Platform indirection for react-native-pager-view, which is native-only —
// importing it on web breaks the Metro bundle (it reaches into RN internals).
// Web resolves PagerView.web.js instead; this file is the native passthrough.
export { default } from "react-native-pager-view";
