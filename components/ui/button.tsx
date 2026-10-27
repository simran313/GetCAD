// Buttons (redesign): the variants are plain functions, usable from server
// components to style a Link (buttonVariants); the Button element is a client
// component so it can show that its form is submitting (Phase 11a).
export { buttonVariants, type ButtonProps } from "./button-variants";
export { Button } from "./button-client";
