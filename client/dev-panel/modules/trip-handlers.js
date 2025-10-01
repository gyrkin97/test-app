// --- ФАЙЛ: client/dev-panel/modules/trip-handlers.js (ОКОНЧАТЕЛЬНЫЙ ФИНАЛЬНЫЙ ВАРИАНТ) ---
import { state, fetchData, invalidateCache } from './trip-state.js';
import { updateUIAndRender } from '../trips-schedule.js';
import { 
    createTrip, 
    updateTrip,
    createEmployee, 
    createOrganization, 
    deleteEmployee, 
    deleteOrganization, 
    deleteTrip,
    fetchEmployeeDetails
} from '../api/trip-api.js';
import { showToast } from '../../common/shared_modules/ui.js';
import { closeModal, showConfirmModal } from '../../common/shared_modules/modals.js';
import { showEmployeeModal, showOrganizationModal, showEmployeeCardModal, showTripModal } from './trip-modals.js';

/**
 * Обрабатывает сохранение (создание или обновление) командировки.
 * ID для редактирования передается напрямую, а не через DOM.
 * @param {Event} e - Событие отправки формы.
 * @param {number | string | null} tripId - ID командировки для редактирования. null, если создается новая.
 */
export async function handleSaveTrip(e, tripId = null) {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Определяем режим работы НАПРЯМУЮ из переданного аргумента.
    const isEditMode = tripId !== null;

    submitBtn.disabled = true;

    try {
        const destination = document.getElementById('trip-destination').value;
        const start_date = document.getElementById('trip-start-date').value;
        const end_date = document.getElementById('trip-end-date').value;
        const organization_id = document.getElementById('trip-organization-id').value;
        const transport_type = document.querySelector('input[name="transport_type"]:checked')?.value;

        if (!organization_id || !transport_type || !destination || !start_date || !end_date) {
            showToast('Пожалуйста, заполните все обязательные поля.', 'error');
            return;
        }
        
        if (new Date(start_date) > new Date(end_date)) {
            showToast('Дата начала не может быть позже даты окончания.', 'error');
            return;
        }

        if (isEditMode) {
            // --- РЕЖИМ РЕДАКТИРОВАНИЯ ---
            submitBtn.textContent = 'Сохранение...';

            const originalTripIndex = state.trips.findIndex(t => t.id == tripId);
            
            if (originalTripIndex === -1) {
                showToast('Ошибка! Исходная командировка не найдена. Данные будут перезагружены.', 'error');
                invalidateCache('trips');
                await fetchData(updateUIAndRender);
                return;
            }

            const tripDataForUpdate = { destination, start_date, end_date, organization_id, transport_type };
            const result = await updateTrip(tripId, tripDataForUpdate);
            showToast('Командировка успешно обновлена.', 'success');

            if (result.updatedTrip) {
                state.trips = [
                    ...state.trips.slice(0, originalTripIndex),
                    result.updatedTrip,
                    ...state.trips.slice(originalTripIndex + 1)
                ];
            }
            updateUIAndRender();
        } else {
            // --- РЕЖИМ СОЗДАНИЯ ---
            submitBtn.textContent = 'Добавление...';
            let employeeIds = [];
            try {
                employeeIds = JSON.parse(document.getElementById('trip-employee-ids').value || '[]');
            } catch (error) {
                showToast('Произошла внутренняя ошибка при выборе сотрудников.', 'error');
                return;
            }
            if (employeeIds.length === 0) {
                showToast('Пожалуйста, выберите хотя бы одного сотрудника.', 'error');
                return;
            }
            const tripDataForCreate = { employee_ids: employeeIds, destination, start_date, end_date, organization_id, transport_type };
            const result = await createTrip(tripDataForCreate);
            showToast(`Командировки успешно добавлены для ${result.inserted} сотрудников.`, 'success');
            invalidateCache('trips'); 
            await fetchData(updateUIAndRender);
        }

        closeModal(document.getElementById('tripModal'));

    } catch (error) {
        showToast(`Ошибка сохранения: ${error.message || 'Неизвестная ошибка'}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEditMode ? 'Сохранить' : 'Добавить';
    }
}

// ... ОСТАЛЬНЫЕ ФУНКЦИИ ОСТАЮТСЯ БЕЗ ИЗМЕНЕНИЙ ...
// (handleAddEmployee, handleAddOrganization, etc.)

export async function handleAddEmployee(e) {
    e.preventDefault();
    const form = e.target;
    const nameInput = form.querySelector('#new-employee-name');
    const positionInput = form.querySelector('#new-employee-position-value');
    const phoneInput = form.querySelector('#new-employee-phone');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    submitBtn.disabled = true;

    try {
        const name = nameInput.value;
        const position = positionInput.value;
        const phone = phoneInput.value;

        await createEmployee(name, position, phone);
        
        showToast('Сотрудник успешно добавлен.', 'success');
        
        await refreshManagedList('employees'); 

        form.reset();
        const defaultPosition = state.positions[0] || '';
        document.getElementById('position-search-input').value = defaultPosition;
        document.getElementById('new-employee-position-value').value = defaultPosition;
        nameInput.focus();
    } catch (error) {
        console.error("Ошибка при добавлении сотрудника:", error);
        showToast(`Ошибка добавления: ${error.message || 'Неизвестная ошибка'}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

export async function handleAddOrganization(e) {
    e.preventDefault();
    const form = e.target;
    const nameInput = document.getElementById('new-organization-name');
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
        await createOrganization(nameInput.value);
        showToast('Организация успешно добавлена.', 'success');
        await refreshManagedList('organizations');
        form.reset();
        nameInput.focus();
    } catch (error) {
        console.error("Ошибка при добавлении организации:", error);
        showToast(`Ошибка добавления: ${error.message || 'Неизвестная ошибка'}`, 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

async function refreshManagedList(type) {
    invalidateCache('all');
    await fetchData(() => {
        updateUIAndRender(); 
        if (type === 'employees') {
            showEmployeeModal();
        } else if (type === 'organizations') {
            showOrganizationModal();
        }
    });
}

export async function handleShowEmployeeCard(e) {
    const cell = e.target.closest('.employee-name-cell');
    if (!cell) return;

    const employeeId = cell.dataset.employeeId;
    if (employeeId) {
        try {
            const details = await fetchEmployeeDetails(employeeId);
            showEmployeeCardModal(details);
        } catch (error) {
            console.error(`Не удалось загрузить детали для сотрудника ID ${employeeId}:`, error);
            showToast(`Не удалось загрузить карточку: ${error.message || 'Неизвестная ошибка'}`, 'error');
        }
    }
}

export function handleDeleteEmployee(e) {
    const btn = e.target.closest('.delete-employee');
    if (!btn) return;

    const employeeId = btn.dataset.id;
    const employeeName = btn.dataset.name;

    showConfirmModal({
        title: `Удалить сотрудника?`,
        text: `Вы уверены, что хотите удалить сотрудника "${employeeName}"? Все связанные с ним командировки также будут удалены. Это действие необратимо.`,
        confirmText: 'Да, удалить',
        onConfirm: async () => {
            try {
                await deleteEmployee(employeeId);
                showToast('Сотрудник удален.', 'success');
                await refreshManagedList('employees');
            } catch (error) {
                console.error("Ошибка при удалении сотрудника:", error);
                showToast(`Ошибка удаления: ${error.message || 'Неизвестная ошибка'}`, 'error');
            }
        }
    });
}

export function handleDeleteOrganization(e) {
    const btn = e.target.closest('.delete-organization');
    if (!btn) return;
    
    const organizationId = btn.dataset.id;
    const organizationName = btn.dataset.name;

    showConfirmModal({
        title: `Удалить организацию?`,
        text: `Вы уверены, что хотите удалить организацию "${organizationName}"? Командировки, связанные с ней, потеряют связь с заказчиком, но не будут удалены.`,
        confirmText: 'Да, удалить',
        onConfirm: async () => {
            try {
                await deleteOrganization(organizationId);
                showToast('Организация удалена.', 'success');
                await refreshManagedList('organizations');
            } catch (error) {
                console.error("Ошибка при удалении организации:", error);
                showToast(`Ошибка удаления: ${error.message || 'Неизвестная ошибка'}`, 'error');
            }
        }
    });
}

export function handleDeleteTrip(e) {
    const tripBar = e.target.closest('.trip-bar');
    if (!tripBar) return;

    document.getElementById('trip-tooltip')?.classList.remove('visible');

    const tripId = tripBar.dataset.id;
    const trip = state.trips.find(t => t.id == tripId);
    if (!trip) return;

    showConfirmModal({
        title: 'Выберите действие',
        text: `Что вы хотите сделать с командировкой сотрудника ${trip.employee_name} в "${trip.destination}"?`,
        confirmText: 'Удалить',
        cancelText: 'Редактировать',
        
        onConfirm: async () => {
            try {
                await deleteTrip(trip.id);
                showToast('Командировка удалена.', 'success');
                invalidateCache('trips');
                await fetchData(updateUIAndRender);
            } catch (error)
                {
                console.error("Ошибка при удалении командировки:", error);
                showToast(`Ошибка удаления: ${error.message || 'Неизвестная ошибка'}`, 'error');
            }
        },
        onCancel: () => {
            showTripModal(trip);
        }
    });
}