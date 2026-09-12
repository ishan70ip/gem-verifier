// Compatibility shim: V1 prototype uses the embedded file-backed store
// (./store.js) so the project runs with zero database setup. All route and
// middleware code keeps importing from this file unchanged.
// Production path: replace this re-export with real Mongoose models.
export * from "./store.js";
