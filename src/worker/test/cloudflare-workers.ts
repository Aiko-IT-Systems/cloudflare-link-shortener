export class DurableObject<Env = unknown> {
	protected readonly ctx: any;
	protected readonly env: Env;

	constructor(ctx: any, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}
}
