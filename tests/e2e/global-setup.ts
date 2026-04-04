export async function setup(): Promise<void> {}

export async function teardown(): Promise<void> {
  const { closeSharedApp } = await import("./shared/app-singleton");
  await closeSharedApp();
}
