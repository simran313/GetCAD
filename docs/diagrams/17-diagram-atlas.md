# Architecture and workflow diagrams

All diagrams in one place, for printing or presenting. Each is generated from an editable source in `docs/diagrams/src/` by `node docs/document-generation/diagrams.mjs`. The source is data (boxes, groups and arrows with coordinates), so a diagram can be changed with a text editor and re-rendered. SVG files are used by the Markdown and the PDF; 2× PNG files (`docs/diagrams/png/`) are used by the Word document.

## System context

Who uses the platform and which services it depends on.

![System context](./01-system-context.svg)

## Request flow and trust boundaries

How a signed-in request reaches the data, and where each check happens.

![Request flow and trust boundaries](./02-request-flow.svg)

## Authentication and identity bridge

From sign-in to a database row.

![Authentication and identity bridge](./03-authentication.svg)

## Order state machine

The 17 states and the legal moves between them.

![Order state machine](./04-order-state-machine.svg)

## Money flow and escrow

Where the money is at every step.

![Money flow and escrow](./05-money-flow.svg)

## File pipeline and IP protection

How CAD files are cleaned, stored and released.

![File pipeline and IP protection](./06-file-pipeline.svg)

## Anonymity wall

How client and designer identities are kept apart.

![Anonymity wall (double blind)](./07-anonymity-wall.svg)

## Delivery pipeline

From a code change to production.

![Delivery pipeline](./08-deployment-pipeline.svg)

## Notifications, push and email

What runs on its own.

![Notifications, push and email](./09-notifications-email.svg)

## Core data model

The central tables and their relationships.

![Core data model](./10-core-data-model.svg)
