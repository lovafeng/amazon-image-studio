# Product Workspace Six-View Design

## Goal

Amazon image production moves from one-off planner sessions to explicit product workspaces. A workspace stores the product's source materials, product information, standardized six-view reference versions, and generated planning state so operators can reuse the same product structure reference across future Listing, A+, and DSP image production.

## Decisions

- The user explicitly creates or opens a workspace before using Amazon Planner.
- The workspace ID is any user-entered string. It is not required to be an ASIN.
- Old Amazon Planner session history does not migrate into workspaces. New UI treats workspace records as the source of truth.
- The six-view reference is a mandatory precondition for image generation, not for AI planning.
- AI planning remains available after workspace entry and product data input.
- Draft generation, batch draft generation, and final generation use the confirmed six-view product reference.
- Future Listing, A+, and DSP drafts default to the confirmed six-view image as the only product structure reference.
- Original reference images remain stored in the workspace as source materials and are not sent by default for downstream image generation.
- Six-view edits create new versions. They never mutate original reference images.
- Users can confirm any six-view version. There is no separate "unconfirm" action.
- Six-view generation uses low-quality draft parameters. It is a reference asset, not a final production image.

## Workflow

1. The operator creates or opens a product workspace.
2. The operator uploads original product reference images and fills or imports product information.
3. The operator generates a standardized six-view image in one 2x3 grid:
   - front
   - back
   - left side
   - right side
   - top
   - bottom
4. If the six-view output is wrong, the operator enters edit instructions and generates a new six-view version.
5. The operator marks one version as the confirmed six-view reference.
6. AI planning can run before or after confirmation.
7. Generation buttons remain disabled until a confirmed six-view exists.
8. Submitted draft tasks use the confirmed six-view reference, plus the hidden style board when the selected slot requires style.
9. Final generation from an Amazon draft carries forward the six-view reference stored on that draft task.

## Data Model

Introduce `ProductWorkspace` as a separate persisted record:

- `id`: user-entered workspace string.
- `title`: display title, usually product title.
- `mode`, `aPlusType`, `resolution`: current planner mode settings.
- `listingText`, `draft`: product copy and structured product fields.
- `referenceImageIds`: original product source images.
- `sixViewVersions`: generated six-view versions with image id, prompt, input image ids, and created time.
- `confirmedSixViewVersionId`: selected six-view version.
- Existing planner state: style candidates, style images, selected style reference, Listing/A+/DSP plans, selected plan indices, and action progress.
- `createdAt`, `updatedAt`.

Server storage follows the existing user-owned JSON record pattern with `/api/product-workspaces`.

## Generation Rules

Six-view generation:

- Uses the active image generation profile through the same image API wrapper.
- Uses low draft quality and 1024x1024 output.
- First generation uses original workspace reference images.
- Later edits use the latest or confirmed six-view version plus the original reference images.
- Stores the resulting image and appends a new workspace version.

Downstream Amazon generation:

- Uses the confirmed six-view image as the product reference image.
- Does not include original reference images by default.
- Keeps the existing hidden style reference behavior for non-MAIN Listing, A+, and DSP outputs.
- Records workspace and six-view metadata on generated tasks.

## UI

When no workspace is active:

- Show a compact workspace entry panel.
- Allow explicit "new workspace" with string ID and optional title.
- Allow opening existing workspaces from a list.
- Hide or disable the production workflow behind the workspace entry state.

When a workspace is active:

- Show a workspace header with ID, title, save, close, and delete controls.
- Show original reference images as source materials.
- Show a mandatory six-view panel before style and generation controls.
- Show version thumbnails and a clear confirmed state.
- Disable draft and batch generation until a confirmed six-view exists.
- Keep AI planning available before six-view confirmation.

## Testing

- Unit tests cover workspace storage routes and database owner isolation.
- Frontend source-level tests cover workspace terminology, six-view gate copy, and disabled generation states.
- Prompt builder tests cover six-view reference guard text.
- Store/export tests cover workspace referenced images.
- Production acceptance uses the in-app browser on the real local app, including workspace creation, reference upload, six-view gate visibility, and disabled generation controls before confirmation.
