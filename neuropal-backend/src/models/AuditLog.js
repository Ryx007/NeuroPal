const { Schema, model } = require('mongoose');

// Append-only audit trail for security-relevant events. Drives the user's
// "Account activity" page and serves the GDPR / data-subject-access
// obligations the plan doc commits to.
//
// Never mutated — `updatedAt: false`. Old entries are TTL-purged after
// 13 months (long enough to satisfy most compliance regimes, short enough
// not to retain unnecessary PII).

const AuditLogSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            // Most events are user-scoped; system events (e.g. cache purge)
            // can omit this.
        },

        event: {
            type: String,
            enum: [
                'login.success',
                'login.failed',
                'logout',
                'password.changed',
                'email.changed',
                'email.verified',
                'mfa.enabled',
                'mfa.disabled',
                'tier.changed',
                'data.exported',
                'data.deleted',
                'document.uploaded',
                'document.deleted',
                'professional.viewed',
                'companion.flagged',
                'session.revoked',
            ],
            required: true,
            index: true,
        },

        // IP, UA, region — only what's necessary, and only when meaningful
        // for the event (a `data.exported` event needs the IP; a passive
        // `companion.flagged` doesn't).
        actor: {
            ip: { type: String },
            userAgent: { type: String, maxlength: 400 },
            country: { type: String, uppercase: true, maxlength: 2 },
        },

        // Free-form per-event payload. Keep small; no full document text.
        meta: { type: Schema.Types.Mixed },

        // Severity for log-shipping triage (security alerts).
        severity: {
            type: String,
            enum: ['info', 'notice', 'warning', 'alert'],
            default: 'info',
        },

        expiresAt: {
            type: Date,
            default: () =>
                new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 13), // ~13 months
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

// ---- Indexes ---------------------------------------------------------------

// "Account activity" page query.
AuditLogSchema.index({ userId: 1, createdAt: -1 });

// Security-team alerting query: "all warning+ events in the last hour".
AuditLogSchema.index({ severity: 1, createdAt: -1 });

// Compliance auto-purge.
AuditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('AuditLog', AuditLogSchema);
