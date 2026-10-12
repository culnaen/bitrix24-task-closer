// ==UserScript==
// @name         Bitrix24: время, результат и завершение
// @namespace    http://tampermonkey.net/
// @version      5.3.2
// @description  Завершает одну или несколько задач с записью времени и результата через REST API Bitrix24.
// @homepageURL  https://github.com/culnaen/bitrix24-task-closer
// @source       https://github.com/culnaen/bitrix24-task-closer.git
// @supportURL   https://github.com/culnaen/bitrix24-task-closer/issues
// @downloadURL  https://raw.githubusercontent.com/culnaen/bitrix24-task-closer/main/bitrix24-close-task.user.js
// @updateURL    https://raw.githubusercontent.com/culnaen/bitrix24-task-closer/main/bitrix24-close-task.user.js
// @match        https://*/company/personal/user/*/tasks
// @match        https://*/company/personal/user/*/tasks/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const INSTANCE_ATTRIBUTE = 'data-tm-task-closer-active';
    const documentRoot = document.documentElement;
    if (documentRoot.hasAttribute(INSTANCE_ATTRIBUTE)) return;
    documentRoot.setAttribute(INSTANCE_ATTRIBUTE, '');

    const DEFAULT_CONFIG = Object.freeze({
        WEBHOOK_USER_ID: 26,
        WEBHOOK_CODE: 'PASTE_INCOMING_WEBHOOK_CODE_HERE',
        ELAPSED_SECONDS: 60,
        COMPLETION_COMMENT: 'Решено.',
    });

    function getConfiguration() {
        const elapsedSeconds = Number(GM_getValue('ELAPSED_SECONDS', DEFAULT_CONFIG.ELAPSED_SECONDS));

        return {
            WEBHOOK_USER_ID: Number(GM_getValue('WEBHOOK_USER_ID', DEFAULT_CONFIG.WEBHOOK_USER_ID)),
            WEBHOOK_CODE: String(GM_getValue('WEBHOOK_CODE', DEFAULT_CONFIG.WEBHOOK_CODE)),
            ELAPSED_SECONDS: Number.isFinite(elapsedSeconds) && elapsedSeconds > 0
                ? elapsedSeconds
                : DEFAULT_CONFIG.ELAPSED_SECONDS,
            COMPLETION_COMMENT: String(
                GM_getValue('COMPLETION_COMMENT', DEFAULT_CONFIG.COMPLETION_COMMENT),
            ) || DEFAULT_CONFIG.COMPLETION_COMMENT,
        };
    }

    function configureScript() {
        document.getElementById('tm-settings-overlay')?.remove();

        const config = getConfiguration();
        const overlay = document.createElement('div');
        const panel = document.createElement('form');
        const inputs = {};

        overlay.id = 'tm-settings-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483647',
            display: 'grid',
            placeItems: 'center',
            padding: '16px',
            boxSizing: 'border-box',
            background: 'rgba(0, 0, 0, 0.55)',
            font: '14px/1.4 sans-serif',
        });
        Object.assign(panel.style, {
            width: 'min(480px, 100%)',
            boxSizing: 'border-box',
            padding: '20px',
            borderRadius: '8px',
            background: '#18181b',
            color: '#fafafa',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        });

        const title = document.createElement('h2');
        title.textContent = 'Настройки Bitrix24 Task Closer';
        title.style.margin = '0';
        panel.append(title);

        const hint = document.createElement('p');
        hint.textContent = 'Код вебхука сохраняется только в хранилище Tampermonkey.';
        hint.style.cssText = 'margin:8px 0 0;color:#d4d4d8;';
        panel.append(hint);

        const fields = [
            ['WEBHOOK_USER_ID', 'userId', 'number', String(config.WEBHOOK_USER_ID)],
            ['WEBHOOK_CODE', 'webhookCode', 'password', config.WEBHOOK_CODE],
            ['Время по умолчанию, минут', 'elapsedMinutes', 'number', String(config.ELAPSED_SECONDS / 60)],
            ['COMPLETION_COMMENT', 'completionComment', 'text', config.COMPLETION_COMMENT],
        ];
        for (const [labelText, name, type, value] of fields) {
            const label = document.createElement('label');
            label.textContent = labelText;
            label.style.cssText = 'display:block;margin-top:12px;';
            const input = document.createElement('input');
            input.type = type;
            input.value = value;
            input.required = true;
            input.style.cssText = 'box-sizing:border-box;display:block;margin-top:4px;padding:8px;width:100%;';
            if (name === 'userId' || name === 'elapsedMinutes') {
                input.min = '1';
                input.step = '1';
                input.inputMode = 'numeric';
            }
            label.append(input);
            panel.append(label);
            inputs[name] = input;
        }

        const error = document.createElement('div');
        error.style.cssText = 'color:#fca5a5;margin-top:12px;min-height:20px;';
        panel.append(error);

        const save = document.createElement('button');
        save.type = 'submit';
        save.textContent = 'Сохранить';
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Сбросить';
        reset.style.marginLeft = '8px';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Отмена';
        cancel.style.marginLeft = '8px';
        panel.append(save, reset, cancel);

        const close = () => overlay.remove();
        cancel.addEventListener('click', close);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) close();
        });
        reset.addEventListener('click', () => {
            GM_setValue('WEBHOOK_USER_ID', DEFAULT_CONFIG.WEBHOOK_USER_ID);
            GM_setValue('WEBHOOK_CODE', DEFAULT_CONFIG.WEBHOOK_CODE);
            GM_setValue('ELAPSED_SECONDS', DEFAULT_CONFIG.ELAPSED_SECONDS);
            GM_setValue('COMPLETION_COMMENT', DEFAULT_CONFIG.COMPLETION_COMMENT);
            close();
        });
        panel.addEventListener('submit', (event) => {
            event.preventDefault();
            const userId = inputs.userId.value.trim();
            const webhookCode = inputs.webhookCode.value.trim();
            const elapsedMinutes = inputs.elapsedMinutes.value.trim();
            const completionComment = inputs.completionComment.value.trim();
            if (!/^\d+$/.test(userId) || Number(userId) === 0) {
                error.textContent = 'WEBHOOK_USER_ID должен быть положительным целым числом.';
                return;
            }
            if (!webhookCode || webhookCode === DEFAULT_CONFIG.WEBHOOK_CODE) {
                error.textContent = 'Укажите код входящего вебхука.';
                return;
            }
            if (!/^\d+$/.test(elapsedMinutes) || Number(elapsedMinutes) === 0) {
                error.textContent = 'Время должно быть положительным целым числом минут.';
                return;
            }
            if (!completionComment) {
                error.textContent = 'COMPLETION_COMMENT не может быть пустым.';
                return;
            }

            GM_setValue('WEBHOOK_USER_ID', Number(userId));
            GM_setValue('WEBHOOK_CODE', webhookCode);
            GM_setValue('ELAPSED_SECONDS', Number(elapsedMinutes) * 60);
            GM_setValue('COMPLETION_COMMENT', completionComment);
            close();
        });

        overlay.append(panel);
        (document.body || document.documentElement).append(overlay);
        inputs.userId.focus();
    }
    GM_registerMenuCommand('Настроить Bitrix24 Task Closer', configureScript);
    const MAX_SAFE_MINUTES = Math.floor(Number.MAX_SAFE_INTEGER / 60);
    const completedTaskIds = new Set();

    class BitrixApiError extends Error {
        constructor(method, status, code, message) {
            super(`${method}: ${code || status}. ${message}`);
            this.name = 'BitrixApiError';
            this.method = method;
            this.status = status;
            this.code = code;
        }
    }

    const TASK_ROWS = 'tr.main-grid-row-body[data-id]';
    const ROW_CHECKBOX = 'input.main-grid-row-checkbox[type="checkbox"]';

    function isTaskList() {
        return /\/company\/personal\/user\/\d+\/tasks\/?$/.test(window.location.pathname);
    }

    function getTaskId(item) {
        const id = item.dataset.id;
        return /^\d+$/.test(id || '') && Number.isSafeInteger(Number(id))
            ? Number(id)
            : null;
    }

    function getTaskRows() {
        return document.querySelectorAll(TASK_ROWS);
    }

    function getSelectedTasks() {
        const tasks = [];
        const seenTaskIds = new Set();
        getTaskRows().forEach((item) => {
            const taskId = getTaskId(item);
            const checkbox = item.querySelector(ROW_CHECKBOX);
            if (!checkbox?.checked || !item.getClientRects().length
                || !taskId || completedTaskIds.has(taskId) || seenTaskIds.has(taskId)) return;
            seenTaskIds.add(taskId);
            tasks.push({ taskId, item });
        });
        return tasks;
    }

    function keepShortRussianWordsTogether(text) {
        return text.replace(/(^|[\s«(])([А-Яа-яЁё])\s+(?=\S)/g, '$1$2\u00a0');
    }

    function getMethodUrl(method, apiVersion) {
        const config = getConfiguration();
        const code = config.WEBHOOK_CODE.trim();

        if (!code || code === DEFAULT_CONFIG.WEBHOOK_CODE) {
            throw new Error('Укажите WEBHOOK_CODE через меню Tampermonkey «Настроить Bitrix24 Task Closer».');
        }

        const apiSegment = apiVersion === 'v3' ? '/rest/api/' : '/rest/';
        return new URL(
            `${apiSegment}${config.WEBHOOK_USER_ID}/${encodeURIComponent(code)}/${method}`,
            window.location.origin,
        );
    }

    async function callRest(method, params, apiVersion = 'v2') {
        const response = await fetch(getMethodUrl(method, apiVersion), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin',
            body: JSON.stringify(params),
        });

        const responseText = await response.text();
        let payload;

        try {
            payload = JSON.parse(responseText);
        } catch (error) {
            throw new BitrixApiError(
                method,
                response.status,
                'INVALID_JSON',
                responseText.slice(0, 200) || error.message,
            );
        }

        if (!response.ok || payload?.error) {
            const apiError = payload?.error;
            const code = typeof apiError === 'string' ? apiError : apiError?.code;
            const message = typeof apiError === 'string'
                ? payload.error_description
                : apiError?.message;

            const scopeHint = code?.includes('INSUFFICIENTSCOPEEXCEPTION')
                ? ' Проверьте права входящего вебхука: нужны scope task и tasks.'
                : '';
            throw new BitrixApiError(
                method,
                response.status,
                code || 'HTTP_ERROR',
                `${message || response.statusText || 'Неизвестная ошибка Bitrix24'}${scopeHint}`,
            );
        }

        return payload;
    }

    async function addElapsedTime(taskId, elapsedSeconds) {
        await callRest('task.elapseditem.add', {
            TASKID: taskId,
            ARFIELDS: {
                SECONDS: elapsedSeconds,
                COMMENT_TEXT: '',
            },
        });
    }

    async function completeTask(taskId) {
        await callRest('tasks.task.complete', { taskId });
    }

    async function processTask(taskId, elapsedSeconds, comment, onStage, onMutationAttempt) {
        onStage('Проверка…');
        const taskResponse = await callRest('tasks.task.get', { id: taskId, select: ['id'] }, 'v3');
        if (Number(taskResponse.result?.item?.id) !== taskId) {
            throw new Error('Bitrix24 не вернул задачу для проверки доступа.');
        }

        onStage('Время…');
        onMutationAttempt();
        await addElapsedTime(taskId, elapsedSeconds);

        onStage('Итог…');
        await callRest('tasks.task.result.add', { fields: { taskId, text: comment } }, 'v3');

        onStage('Закрытие…');
        await completeTask(taskId);
    }

    const dialogState = {
        activeTasks: [],
        focusReturn: null,
        dialog: null,
        elements: null,
        submitting: false,
        retryBlocked: false,
    };

    const selectionState = {
        bar: null,
        count: null,
        submit: null,
    };

    function installStyles() {
        if (document.getElementById('tm-completion-styles')) return;

        const style = document.createElement('style');
        style.id = 'tm-completion-styles';
        style.textContent = `
            .tm-selection-bar,
            .tm-completion-dialog {
                --tm-surface: #ffffff;
                --tm-surface-subtle: #f5f7f8;
                --tm-surface-error: #fff2f2;
                --tm-text-primary: #303549;
                --tm-text-secondary: #68717d;
                --tm-text-on-accent: #ffffff;
                --tm-border: #c6cdd3;
                --tm-border-subtle: #e3e8eb;
                --tm-accent: #2067b0;
                --tm-accent-hover: #185a9e;
                --tm-accent-active: #134c86;
                --tm-success: #287d3c;
                --tm-error: #b42318;
                --tm-focus: rgba(32, 103, 176, 0.28);
                --tm-backdrop: rgba(28, 38, 48, 0.42);
                --tm-shadow-modal: 0 12px 36px rgba(32, 45, 58, 0.24);
                --tm-shadow-floating: 0 6px 22px rgba(32, 45, 58, 0.2);
                --tm-opacity-control-disabled: .66;
                --tm-space-1: 4px;
                --tm-space-2: 8px;
                --tm-space-3: 12px;
                --tm-space-4: 16px;
                --tm-space-5: 20px;
                --tm-space-6: 24px;
                --tm-dialog-width: 440px;
                --tm-control-height: 40px;
                --tm-textarea-height: 104px;
                --tm-font-heading: 18px;
                --tm-font-body: 14px;
                --tm-font-small: 12px;
                --tm-border-width: 1px;
                --tm-radius-small: 3px;
                --tm-radius-dialog: 5px;
                --tm-motion-fast: 120ms ease-out;
            }

            .tm-selection-bar {
                position: fixed;
                inset-inline-start: 50%;
                inset-block-end: var(--tm-space-4);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: var(--tm-space-3);
                box-sizing: border-box;
                max-inline-size: calc(100vw - (var(--tm-space-4) * 2));
                min-block-size: 52px;
                padding: var(--tm-space-2) var(--tm-space-3) var(--tm-space-2) var(--tm-space-4);
                transform: translateX(-50%);
                border: var(--tm-border-width) solid var(--tm-border-subtle);
                border-radius: var(--tm-radius-dialog);
                background: var(--tm-surface);
                color: var(--tm-text-primary);
                box-shadow: var(--tm-shadow-floating);
                font: 400 var(--tm-font-body)/1.45 Arial, "Helvetica Neue", sans-serif;
            }

            .tm-selection-bar[hidden] {
                display: none;
            }

            .tm-selection-bar__count {
                min-inline-size: max-content;
                font-weight: 600;
            }

            .tm-selection-bar__button {
                min-block-size: 36px;
                padding: var(--tm-space-2) var(--tm-space-3);
                border: var(--tm-border-width) solid var(--tm-border);
                border-radius: var(--tm-radius-small);
                background: var(--tm-surface);
                color: var(--tm-text-primary);
                cursor: pointer;
                font: inherit;
                white-space: nowrap;
                transition: background-color var(--tm-motion-fast), border-color var(--tm-motion-fast), color var(--tm-motion-fast);
            }

            .tm-selection-bar__button:hover {
                background: var(--tm-surface-subtle);
                border-color: var(--tm-text-secondary);
            }

            .tm-selection-bar__button--submit {
                border-color: var(--tm-accent);
                background: var(--tm-accent);
                color: var(--tm-text-on-accent);
                font-weight: 600;
            }

            .tm-selection-bar__button--submit:hover {
                border-color: var(--tm-accent-hover);
                background: var(--tm-accent-hover);
            }

            .tm-selection-bar__button:active {
                border-color: var(--tm-accent-active);
                background: var(--tm-accent-active);
                color: var(--tm-text-on-accent);
            }

            .tm-selection-bar__button:focus-visible {
                outline: var(--tm-border-width) solid var(--tm-accent);
                outline-offset: var(--tm-space-1);
                box-shadow: 0 0 0 var(--tm-space-1) var(--tm-focus);
            }

            .tm-completion-dialog {
                box-sizing: border-box;
                inline-size: min(var(--tm-dialog-width), calc(100vw - (var(--tm-space-4) * 2)));
                max-block-size: calc(100dvh - (var(--tm-space-4) * 2));
                margin: auto;
                padding: 0;
                overflow: auto;
                border: var(--tm-border-width) solid var(--tm-border-subtle);
                border-radius: var(--tm-radius-dialog);
                background: var(--tm-surface);
                color: var(--tm-text-primary);
                box-shadow: var(--tm-shadow-modal);
                font: 400 var(--tm-font-body)/1.45 Arial, "Helvetica Neue", sans-serif;
            }

            .tm-completion-dialog::backdrop {
                background: var(--tm-backdrop);
            }

            .tm-completion-dialog__form,
            .tm-completion-dialog__body,
            .tm-completion-dialog__field {
                display: flex;
                flex-direction: column;
            }

            .tm-completion-dialog__header {
                padding: var(--tm-space-5) var(--tm-space-6) var(--tm-space-4);
                border-block-end: var(--tm-border-width) solid var(--tm-border-subtle);
            }

            .tm-completion-dialog__title {
                margin: 0;
                overflow-wrap: anywhere;
                text-wrap: balance;
                font-size: var(--tm-font-heading);
                font-weight: 600;
                line-height: 1.35;
            }

            .tm-completion-dialog__context {
                margin: var(--tm-space-1) 0 0;
                color: var(--tm-text-secondary);
                font-size: var(--tm-font-small);
            }

            .tm-completion-dialog__body {
                gap: var(--tm-space-4);
                padding: var(--tm-space-5) var(--tm-space-6);
            }

            .tm-completion-dialog__field {
                gap: var(--tm-space-1);
            }

            .tm-completion-dialog__label {
                font-weight: 600;
            }

            .tm-completion-dialog__input,
            .tm-completion-dialog__textarea,
            .tm-completion-dialog__button {
                box-sizing: border-box;
                border: var(--tm-border-width) solid var(--tm-border);
                border-radius: var(--tm-radius-small);
                font: inherit;
            }

            .tm-completion-dialog__input,
            .tm-completion-dialog__textarea {
                inline-size: 100%;
                padding: var(--tm-space-2) var(--tm-space-3);
                background: var(--tm-surface);
                color: var(--tm-text-primary);
            }

            .tm-completion-dialog__input {
                min-block-size: var(--tm-control-height);
            }

            .tm-completion-dialog__textarea {
                min-block-size: var(--tm-textarea-height);
                resize: vertical;
            }

            .tm-completion-dialog__input:focus-visible,
            .tm-completion-dialog__textarea:focus-visible,
            .tm-completion-dialog__button:focus-visible {
                outline: var(--tm-border-width) solid var(--tm-accent);
                outline-offset: var(--tm-space-1);
                box-shadow: 0 0 0 var(--tm-space-1) var(--tm-focus);
            }

            .tm-completion-dialog__input[aria-invalid="true"],
            .tm-completion-dialog__textarea[aria-invalid="true"] {
                border-color: var(--tm-error);
            }

            .tm-completion-dialog__help,
            .tm-completion-dialog__field-error,
            .tm-completion-dialog__status,
            .tm-completion-dialog__error {
                font-size: var(--tm-font-small);
            }

            .tm-completion-dialog__help,
            .tm-completion-dialog__status {
                color: var(--tm-text-secondary);
            }

            .tm-completion-dialog__field-error,
            .tm-completion-dialog__error {
                color: var(--tm-error);
            }

            .tm-completion-dialog__status,
            .tm-completion-dialog__error {
                margin: 0;
                padding: var(--tm-space-2) var(--tm-space-3);
                border-radius: var(--tm-radius-small);
            }

            .tm-completion-dialog__status {
                background: var(--tm-surface-subtle);
            }

            .tm-completion-dialog__status[data-state="success"] {
                color: var(--tm-success);
            }

            .tm-completion-dialog__error {
                background: var(--tm-surface-error);
            }

            .tm-completion-dialog__error:focus {
                outline: var(--tm-border-width) solid var(--tm-accent);
                outline-offset: var(--tm-space-1);
                box-shadow: 0 0 0 var(--tm-space-1) var(--tm-focus);
            }

            .tm-completion-dialog__field-error[hidden],
            .tm-completion-dialog__error[hidden] {
                display: none;
            }

            .tm-completion-dialog__actions {
                display: flex;
                justify-content: flex-end;
                gap: var(--tm-space-2);
                padding: var(--tm-space-4) var(--tm-space-6) var(--tm-space-5);
                border-block-start: var(--tm-border-width) solid var(--tm-border-subtle);
            }

            .tm-completion-dialog__button {
                min-block-size: var(--tm-control-height);
                padding: var(--tm-space-2) var(--tm-space-4);
                cursor: pointer;
                transition: background-color var(--tm-motion-fast), border-color var(--tm-motion-fast), color var(--tm-motion-fast), opacity var(--tm-motion-fast);
            }

            .tm-completion-dialog__button--cancel {
                background: var(--tm-surface);
                color: var(--tm-text-primary);
            }

            .tm-completion-dialog__button--cancel:hover {
                background: var(--tm-surface-subtle);
                border-color: var(--tm-text-secondary);
            }

            .tm-completion-dialog__button--submit {
                border-color: var(--tm-accent);
                background: var(--tm-accent);
                color: var(--tm-text-on-accent);
                font-weight: 600;
            }

            .tm-completion-dialog__button--submit:hover {
                border-color: var(--tm-accent-hover);
                background: var(--tm-accent-hover);
            }

            .tm-completion-dialog__button--submit:active {
                border-color: var(--tm-accent-active);
                background: var(--tm-accent-active);
            }

            .tm-completion-dialog__button:disabled,
            .tm-completion-dialog__input:disabled,
            .tm-completion-dialog__textarea:disabled {
                cursor: wait;
                opacity: var(--tm-opacity-control-disabled);
            }

            @media (max-width: 479px) {
                .tm-completion-dialog__header,
                .tm-completion-dialog__body,
                .tm-completion-dialog__actions {
                    padding-inline: var(--tm-space-4);
                }

                .tm-completion-dialog__actions {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                }

                .tm-completion-dialog__button {
                    inline-size: 100%;
                    padding-inline: var(--tm-space-2);
                }

                .tm-selection-bar {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    inline-size: calc(100vw - (var(--tm-space-4) * 2));
                }

                .tm-selection-bar[hidden] {
                    display: none;
                }

                .tm-selection-bar__count {
                    grid-column: 1 / -1;
                }

                .tm-selection-bar__button {
                    inline-size: 100%;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .tm-selection-bar__button,
                .tm-completion-dialog__button {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setFieldError(field, errorElement, message) {
        field.setAttribute('aria-invalid', String(Boolean(message)));
        field.setCustomValidity(message);
        errorElement.textContent = message;
        errorElement.hidden = !message;
    }

    function clearDialogMessages() {
        const { minutes, minutesError, comment, commentError, error, status } = dialogState.elements;
        setFieldError(minutes, minutesError, '');
        setFieldError(comment, commentError, '');
        error.textContent = '';
        error.hidden = true;
        status.textContent = 'Введите время и результат работы.';
        status.dataset.state = 'idle';
    }

    function readSubmission() {
        const { minutes, minutesError, comment, commentError } = dialogState.elements;
        const minutesText = minutes.value.trim();
        const parsedMinutes = Number(minutesText);
        const elapsedSeconds = parsedMinutes * 60;
        const commentText = comment.value.trim();
        const minutesMessage = /^[1-9]\d*$/.test(minutesText)
            && Number.isSafeInteger(parsedMinutes)
            && Number.isSafeInteger(elapsedSeconds)
            ? ''
            : `Введите целое число минут от 1 до ${MAX_SAFE_MINUTES}.`;
        const commentMessage = commentText ? '' : 'Введите результат работы.';

        setFieldError(minutes, minutesError, minutesMessage);
        setFieldError(comment, commentError, commentMessage);

        if (minutesMessage) {
            minutes.focus();
            return null;
        }
        if (commentMessage) {
            comment.focus();
            return null;
        }

        return {
            elapsedSeconds,
            comment: commentText,
        };
    }

    function setSubmitting(submitting) {
        const { dialog, elements } = dialogState;
        dialogState.submitting = submitting;
        dialog.setAttribute('aria-busy', String(submitting));
        elements.minutes.disabled = submitting;
        elements.comment.disabled = submitting;
        elements.cancel.disabled = submitting;
        elements.submit.disabled = submitting || dialogState.retryBlocked;
        if (!submitting) {
            elements.submit.textContent = dialogState.retryBlocked
                ? 'Повтор недоступен'
                : 'Записать и завершить';
        }
    }

    function setStage(stage) {
        const { status, submit } = dialogState.elements;
        status.textContent = stage;
        status.dataset.state = 'loading';
        submit.textContent = stage;
    }

    function closeDialog(returnValue) {
        if (!dialogState.dialog?.open || dialogState.submitting) return;
        dialogState.dialog.close(returnValue);
    }

    function unselectCompletedTask(taskId) {
        getTaskRows().forEach((item) => {
            if (getTaskId(item) !== taskId) return;
            const checkbox = item.querySelector(ROW_CHECKBOX);
            if (checkbox?.checked) checkbox.click();
        });
    }

    function updateSelectionBar() {
        if (!selectionState.bar) return;
        const selectedCount = getSelectedTasks().length;
        const shouldHide = !isTaskList() || selectedCount === 0;
        const countText = `Выбрано: ${selectedCount}`;
        if (selectionState.bar.hidden !== shouldHide) selectionState.bar.hidden = shouldHide;
        if (selectionState.count.textContent !== countText) selectionState.count.textContent = countText;
        if (selectionState.submit.disabled !== shouldHide) selectionState.submit.disabled = shouldHide;
    }

    function clearSelection() {
        getTaskRows().forEach((item) => {
            const checkbox = item.querySelector(ROW_CHECKBOX);
            if (checkbox?.checked) checkbox.click();
        });
        updateSelectionBar();
    }

    function createSelectionBar() {
        if (selectionState.bar) return selectionState.bar;

        const bar = document.createElement('section');
        bar.className = 'tm-selection-bar';
        bar.hidden = true;
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Групповое завершение задач');
        bar.innerHTML = `
            <span class="tm-selection-bar__count" aria-live="polite">Выбрано: 0</span>
            <button class="tm-selection-bar__button tm-selection-bar__button--clear" type="button">Снять выбор</button>
            <button class="tm-selection-bar__button tm-selection-bar__button--submit" type="button">Завершить…</button>
        `;
        document.body.appendChild(bar);

        selectionState.bar = bar;
        selectionState.count = bar.querySelector('.tm-selection-bar__count');
        selectionState.submit = bar.querySelector('.tm-selection-bar__button--submit');

        bar.querySelector('.tm-selection-bar__button--clear').addEventListener('click', clearSelection);
        selectionState.submit.addEventListener('click', () => {
            const tasks = getSelectedTasks();
            if (tasks.length === 0) {
                updateSelectionBar();
                return;
            }
            openDialog(tasks, selectionState.submit);
        });
        return bar;
    }
    function createDialog() {
        installStyles();

        const dialog = document.createElement('dialog');
        dialog.className = 'tm-completion-dialog';
        dialog.setAttribute('aria-labelledby', 'tm-completion-title');
        dialog.setAttribute('aria-describedby', 'tm-completion-context tm-completion-status');
        dialog.innerHTML = `
            <form class="tm-completion-dialog__form" novalidate>
                <header class="tm-completion-dialog__header">
                    <h2 class="tm-completion-dialog__title" id="tm-completion-title"></h2>
                    <p class="tm-completion-dialog__context" id="tm-completion-context"></p>
                </header>
                <div class="tm-completion-dialog__body">
                    <div class="tm-completion-dialog__field">
                        <label class="tm-completion-dialog__label" for="tm-completion-minutes">Затраченное время, минуты</label>
                        <input class="tm-completion-dialog__input" id="tm-completion-minutes" name="minutes" type="number" min="1" max="${MAX_SAFE_MINUTES}" step="1" inputmode="numeric" required aria-describedby="tm-completion-minutes-help tm-completion-minutes-error">
                        <span class="tm-completion-dialog__help" id="tm-completion-minutes-help">Только целые минуты, минимум 1.</span>
                        <span class="tm-completion-dialog__field-error" id="tm-completion-minutes-error" hidden></span>
                    </div>
                    <div class="tm-completion-dialog__field">
                        <label class="tm-completion-dialog__label" for="tm-completion-comment">Результат работы</label>
                        <textarea class="tm-completion-dialog__textarea" id="tm-completion-comment" name="comment" required aria-describedby="tm-completion-comment-error"></textarea>
                        <span class="tm-completion-dialog__field-error" id="tm-completion-comment-error" hidden></span>
                    </div>
                    <p class="tm-completion-dialog__status" id="tm-completion-status" role="status" aria-live="polite"></p>
                    <p class="tm-completion-dialog__error" id="tm-completion-error" role="alert" tabindex="-1" hidden></p>
                </div>
                <footer class="tm-completion-dialog__actions">
                    <button class="tm-completion-dialog__button tm-completion-dialog__button--cancel" type="button">Отмена</button>
                    <button class="tm-completion-dialog__button tm-completion-dialog__button--submit" type="submit">Записать и завершить</button>
                </footer>
            </form>
        `;
        document.body.appendChild(dialog);

        const elements = {
            form: dialog.querySelector('form'),
            title: dialog.querySelector('#tm-completion-title'),
            context: dialog.querySelector('#tm-completion-context'),
            minutes: dialog.querySelector('#tm-completion-minutes'),
            minutesError: dialog.querySelector('#tm-completion-minutes-error'),
            comment: dialog.querySelector('#tm-completion-comment'),
            commentError: dialog.querySelector('#tm-completion-comment-error'),
            status: dialog.querySelector('#tm-completion-status'),
            error: dialog.querySelector('#tm-completion-error'),
            cancel: dialog.querySelector('.tm-completion-dialog__button--cancel'),
            submit: dialog.querySelector('.tm-completion-dialog__button--submit'),
        };

        dialogState.dialog = dialog;
        dialogState.elements = elements;

        elements.cancel.addEventListener('click', () => closeDialog('cancel'));

        dialog.addEventListener('cancel', (event) => {
            if (dialogState.submitting) event.preventDefault();
        });

        dialog.addEventListener('close', () => {
            const focusTarget = dialogState.focusReturn;
            dialogState.activeTasks = [];
            dialogState.focusReturn = null;
            if (focusTarget?.isConnected) focusTarget.focus();
        });

        dialog.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (!dialogState.submitting && !dialogState.retryBlocked) {
                    elements.form.requestSubmit();
                }
            }
        });

        elements.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (dialogState.submitting || dialogState.retryBlocked || dialogState.activeTasks.length === 0) return;

            clearDialogMessages();
            const submission = readSubmission();
            if (!submission) return;

            const activeTasks = [...dialogState.activeTasks];
            const failures = [];
            let completedCount = 0;
            setSubmitting(true);

            for (const [index, activeTask] of activeTasks.entries()) {
                let mutationAttempted = false;
                const stagePrefix = activeTasks.length > 1
                    ? `Задача ${index + 1} из ${activeTasks.length}`
                    : '';
                try {
                    await processTask(
                        activeTask.taskId,
                        submission.elapsedSeconds,
                        submission.comment,
                        (stage) => setStage(stagePrefix ? `${stagePrefix}: ${stage}` : stage),
                        () => { mutationAttempted = true; },
                    );
                    completedCount += 1;
                    completedTaskIds.add(activeTask.taskId);
                    unselectCompletedTask(activeTask.taskId);
                } catch (error) {
                    failures.push({ activeTask, error, mutationAttempted });
                    console.error('[Bitrix24 task completion]', activeTask.taskId, error);
                }
            }

            updateSelectionBar();

            if (failures.length === 0) {
                elements.status.textContent = activeTasks.length === 1
                    ? 'Задача завершена.'
                    : `Завершено задач: ${completedCount}.`;
                elements.status.dataset.state = 'success';
                elements.submit.textContent = 'Готово';
                setTimeout(() => {
                    setSubmitting(false);
                    closeDialog('success');
                }, 700);
                return;
            }

            const retryIsSafe = activeTasks.length === 1
                && completedCount === 0
                && !failures[0].mutationAttempted;
            dialogState.retryBlocked = !retryIsSafe;
            setSubmitting(false);
            elements.error.textContent = failures.map(({ activeTask, error }) => (
                `Задача №${activeTask.taskId}: ${error instanceof Error ? error.message : String(error)}`
            )).join(' ');
            elements.error.hidden = false;
            elements.status.textContent = retryIsSafe
                ? 'Данные сохранены в форме. Можно повторить отправку.'
                : `Завершено: ${completedCount}. С ошибкой: ${failures.length}. Проверьте эти задачи в Bitrix24 перед ручным повтором.`;
            elements.status.dataset.state = 'error';
            requestAnimationFrame(() => elements.error.focus());
        });

        return dialog;
    }

    function openDialog(tasks, focusReturn) {
        const activeTasks = tasks.filter(({ taskId }) => !completedTaskIds.has(taskId));
        if (activeTasks.length === 0) return;
        const dialog = dialogState.dialog || createDialog();
        if (dialog.open) return;

        const firstTask = activeTasks[0];
        const title = firstTask.item.querySelector('a[href*="/tasks/task/view/"]')?.textContent?.trim()
            || `Задача №${firstTask.taskId}`;
        dialogState.activeTasks = activeTasks;
        dialogState.focusReturn = focusReturn;
        dialogState.retryBlocked = false;
        dialogState.elements.title.textContent = keepShortRussianWordsTogether(
            activeTasks.length === 1
                ? `Завершить задачу «${title}»`
                : `Завершить выбранные задачи (${activeTasks.length})`,
        );
        dialogState.elements.context.textContent = keepShortRussianWordsTogether(
            activeTasks.length === 1
                ? `Задача №${firstTask.taskId}`
                : `Одинаковые время и комментарий будут добавлены к ${activeTasks.length} задачам.`,
        );
        const config = getConfiguration();
        dialogState.elements.minutes.value = String(config.ELAPSED_SECONDS / 60);
        dialogState.elements.comment.value = config.COMPLETION_COMMENT;
        setSubmitting(false);
        clearDialogMessages();
        dialog.showModal();
        requestAnimationFrame(() => {
            dialogState.elements.minutes.focus();
            dialogState.elements.minutes.select();
        });
    }

    function init() {
        if (isTaskList() && getSelectedTasks().length > 0) {
            installStyles();
            createSelectionBar();
        }
        updateSelectionBar();
    }

    let initScheduled = false;
    function scheduleInit() {
        if (initScheduled) return;
        initScheduled = true;
        requestAnimationFrame(() => {
            initScheduled = false;
            init();
        });
    }

    document.addEventListener('change', (event) => {
        if (event.target.matches(ROW_CHECKBOX)) init();
    });
    document.addEventListener('click', (event) => {
        if (event.target.closest('.main-grid-cell-checkbox, .main-grid-row-head')) scheduleInit();
    });
    init();
    new MutationObserver(scheduleInit).observe(document.body, {
        childList: true,
        subtree: true,
    });
}());
