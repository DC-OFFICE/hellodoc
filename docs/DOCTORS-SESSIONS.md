# HelloDoc — Doctors & Consultation Sessions

## Apply clinic schema migrations

For existing clinics (e.g. Chami's Place):

```bash
npm run tenants:migrate
```

New clinics approved after this release automatically receive migrations `001` and `002`.

## Routes
- `/doctors`, `/doctors/new`, `/doctors/:id`, `/doctors/:id/edit`
- `/sessions`, `/sessions/new`, `/sessions/:id`

## APIs
- `GET/POST /api/clinic/doctors`
- `GET/PATCH /api/clinic/doctors/:id`
- `POST /api/clinic/doctors/:id/deactivate|reactivate`
- `GET/POST /api/clinic/sessions`
- `GET/PATCH /api/clinic/sessions/:id`
- `POST /api/clinic/sessions/:id/cancel`
- `GET/POST /api/clinic/doctors/:id/schedule-templates`
- `POST /api/clinic/schedule-templates/:id/deactivate|materialize`

## Notes
- Overlaps are blocked by a PostgreSQL GiST exclusion constraint (`[start,end)`).
- Cancelled sessions do not block the slot and are not recreated by materialization (`occurrence_key`).
- Timezone default: `Asia/Colombo`.
- No patients, appointments, or queues in this milestone.
