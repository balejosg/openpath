import { buildRequestDomainOptions, shouldEnableSubmitRequest } from './popup-request-actions.js';
import { shouldEnableRequestAction, type BlockedDomainsData } from './popup-state.js';
import { buildBlockedDomainListItems } from './popup-view-models.js';

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function hidePopupRequestSection(requestSectionEl: HTMLElement): void {
  requestSectionEl.classList.add('hidden');
}

export function syncPopupRequestButtonState(input: {
  btnRequest: HTMLButtonElement;
  hasDomains: boolean;
  nativeAvailable: boolean;
  requestConfigured: boolean;
  requestSectionEl: HTMLElement;
}): void {
  const canRequest = shouldEnableRequestAction({
    hasDomains: input.hasDomains,
    nativeAvailable: input.nativeAvailable,
    requestConfigured: input.requestConfigured,
  });

  if (canRequest) {
    input.btnRequest.classList.remove('hidden');
    input.btnRequest.disabled = false;
    return;
  }

  input.btnRequest.classList.add('hidden');
  input.btnRequest.disabled = true;
  hidePopupRequestSection(input.requestSectionEl);
}

export function renderPopupDomainsList(input: {
  blockedDomainsData: BlockedDomainsData;
  btnCopy: HTMLButtonElement;
  btnVerify: HTMLButtonElement;
  countEl: HTMLElement;
  createListItem?: () => HTMLLIElement;
  currentTabId: number | null;
  domainStatusesData: Record<string, DomainStatus>;
  domainsListEl: HTMLElement;
  emptyMessageEl: HTMLElement;
  isNativeAvailable: boolean;
}): void {
  const hostnames = Object.keys(input.blockedDomainsData).sort();

  if (hostnames.length === 0) {
    input.countEl.textContent = '0';
    input.domainsListEl.classList.add('hidden');
    input.emptyMessageEl.classList.remove('hidden');
    input.btnCopy.disabled = true;
    input.btnVerify.disabled = true;
    return;
  }

  input.countEl.textContent = hostnames.length.toString();
  input.domainsListEl.classList.remove('hidden');
  input.emptyMessageEl.classList.add('hidden');
  input.btnCopy.disabled = false;
  input.btnVerify.disabled = !input.isNativeAvailable;

  const createListItem =
    input.createListItem ?? ((): HTMLLIElement => document.createElement('li'));

  input.domainsListEl.innerHTML = '';
  buildBlockedDomainListItems({
    blockedDomainsData: input.blockedDomainsData,
    currentTabId: input.currentTabId,
    domainStatusesData: input.domainStatusesData,
  }).forEach((viewModel) => {
    const item = createListItem();
    item.className = 'domain-item';
    const hostname = escapeHtmlAttribute(viewModel.hostname);
    const statusLabel = escapeHtmlAttribute(viewModel.statusLabel);
    const statusTitle = escapeHtmlAttribute(viewModel.statusTitle);
    const retryButton = viewModel.retryHostname
      ? `<button class="retry-update-btn" data-hostname="${escapeHtmlAttribute(viewModel.retryHostname)}" title="Reintentar actualización local">Reintentar</button>`
      : '';

    item.innerHTML = `
            <span class="domain-name" title="${hostname}">${hostname}</span>
            <span class="domain-meta">
                <span class="domain-count" title="Intentos de conexión">${viewModel.attempts.toString()}</span>
                <span class="domain-status ${viewModel.statusClassName}" title="${statusTitle}">${statusLabel}</span>
                ${retryButton}
            </span>
        `;
    input.domainsListEl.appendChild(item);
  });
}

export function populatePopupRequestDomainSelect(input: {
  blockedDomainsData: BlockedDomainsData;
  createOption?: () => HTMLOptionElement;
  requestDomainSelectEl: HTMLSelectElement;
}): void {
  input.requestDomainSelectEl.innerHTML = '<option value="">Seleccionar dominio...</option>';

  const createOption =
    input.createOption ?? ((): HTMLOptionElement => document.createElement('option'));

  buildRequestDomainOptions(input.blockedDomainsData).forEach(({ hostname, origin }) => {
    const option = createOption();
    option.value = hostname;
    option.textContent = hostname;
    option.dataset.origin = origin;
    input.requestDomainSelectEl.appendChild(option);
  });
}

export function syncPopupSubmitButtonState(input: {
  btnSubmitRequest: HTMLButtonElement;
  hasSelectedDomain: boolean;
  hasValidReason: boolean;
  isNativeAvailable: boolean;
  isRequestConfigured: boolean;
}): void {
  input.btnSubmitRequest.disabled = !shouldEnableSubmitRequest({
    hasSelectedDomain: input.hasSelectedDomain,
    hasValidReason: input.hasValidReason,
    isNativeAvailable: input.isNativeAvailable,
    isRequestConfigured: input.isRequestConfigured,
  });
}

export function togglePopupRequestSection(input: {
  blockedDomainsData: BlockedDomainsData;
  createOption?: () => HTMLOptionElement;
  onHide: () => void;
  onShow: () => void;
  requestDomainSelectEl: HTMLSelectElement;
  requestSectionEl: HTMLElement;
}): void {
  const isHidden = input.requestSectionEl.classList.contains('hidden');

  if (isHidden) {
    input.requestSectionEl.classList.remove('hidden');
    populatePopupRequestDomainSelect({
      blockedDomainsData: input.blockedDomainsData,
      ...(input.createOption ? { createOption: input.createOption } : {}),
      requestDomainSelectEl: input.requestDomainSelectEl,
    });
    input.onShow();
    return;
  }

  hidePopupRequestSection(input.requestSectionEl);
  input.onHide();
}
