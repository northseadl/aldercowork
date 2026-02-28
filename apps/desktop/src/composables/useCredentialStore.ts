/**
 * Credential store composable — Vue-friendly wrapper over kernelConfig service.
 *
 * This composable exists only for backward compatibility with components
 * that call `const creds = useCredentialStore(); await creds.setApiKey(...)`.
 * New code should import directly from `../services/kernelConfig`.
 */
import * as kernelConfig from '../services/kernelConfig'

export function useCredentialStore() {
    return {
        initialized: { value: true },
        getApiKey: kernelConfig.getApiKey,
        setApiKey: kernelConfig.setApiKey,
        removeApiKey: kernelConfig.removeApiKey,
        setBaseUrl: kernelConfig.setBaseUrl,
        getFullConfig: kernelConfig.loadConfig,
        getHubToken: kernelConfig.getHubToken,
        setHubToken: kernelConfig.setHubToken,
        removeHubToken: kernelConfig.removeHubToken,
    }
}
