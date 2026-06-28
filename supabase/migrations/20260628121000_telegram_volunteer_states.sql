-- Add volunteer fix-submission states to the Telegram conversation FSM.

alter table public.telegram_conversations
  drop constraint if exists telegram_conversations_state_check;

alter table public.telegram_conversations
  add constraint telegram_conversations_state_check
  check (
    state in (
      'idle',
      'awaiting_full_name',
      'awaiting_phone',
      'awaiting_photo',
      'awaiting_location',
      'awaiting_description',
      'awaiting_ai_confirmation',
      'awaiting_correction_description',
      'awaiting_fix_photo',
      'awaiting_fix_location',
      'awaiting_fix_description'
    )
  );
