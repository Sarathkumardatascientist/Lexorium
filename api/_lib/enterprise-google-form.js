const DEFAULT_ENTERPRISE_GOOGLE_FORM = {
  actionUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf01igCG8ADR0kzbGeMwhNr4G2awOfb6Rkp3xkpLm1frnK_8g/formResponse',
  entries: {
    fullName: 'entry.516211488',
    workEmail: 'entry.1043304193',
    organization: 'entry.1889998268',
    role: 'entry.1448955785',
    teamSize: 'entry.519110386',
    queryVolume: 'entry.1715481853',
    useCase: 'entry.746363549',
    requirements: 'entry.19975130',
  },
};

function clean(value) {
  return String(value || '').trim();
}

function getEnterpriseGoogleFormConfig(env = process.env) {
  return {
    actionUrl: clean(env.GOOGLE_FORM_ACTION_URL) || DEFAULT_ENTERPRISE_GOOGLE_FORM.actionUrl,
    entries: {
      fullName: clean(env.GOOGLE_FORM_ENTRY_FULL_NAME) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.fullName,
      workEmail: clean(env.GOOGLE_FORM_ENTRY_WORK_EMAIL) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.workEmail,
      organization: clean(env.GOOGLE_FORM_ENTRY_ORGANIZATION) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.organization,
      role: clean(env.GOOGLE_FORM_ENTRY_ROLE) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.role,
      teamSize: clean(env.GOOGLE_FORM_ENTRY_TEAM_SIZE) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.teamSize,
      queryVolume: clean(env.GOOGLE_FORM_ENTRY_QUERY_VOLUME) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.queryVolume,
      useCase: clean(env.GOOGLE_FORM_ENTRY_USE_CASE) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.useCase,
      requirements: clean(env.GOOGLE_FORM_ENTRY_REQUIREMENTS) || DEFAULT_ENTERPRISE_GOOGLE_FORM.entries.requirements,
    },
  };
}

function hasEnterpriseGoogleFormConfig(env = process.env) {
  const config = getEnterpriseGoogleFormConfig(env);
  return Boolean(
    config.actionUrl &&
    config.entries.fullName &&
    config.entries.workEmail &&
    config.entries.organization &&
    config.entries.requirements
  );
}

module.exports = {
  DEFAULT_ENTERPRISE_GOOGLE_FORM,
  getEnterpriseGoogleFormConfig,
  hasEnterpriseGoogleFormConfig,
};
