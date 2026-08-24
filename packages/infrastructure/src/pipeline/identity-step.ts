import type { ResolvedIdentity, IdentityResolver } from "../auth/resolve-identity.ts";
import { PipelineError } from "./errors.ts";
export class ResolveIdentityStep {
    private readonly resolver: IdentityResolver;
    constructor(resolver: IdentityResolver) {
        this.resolver = resolver;
    }
    async run(request: Request): Promise<ResolvedIdentity> {
        const identity = await this.resolver.resolveIdentity(request);
        if (!identity) {
            throw new PipelineError("TOKEN_EXPIRED", "Kredensial tidak ada atau tidak valid.", 401);
        }
        return identity;
    }
}
