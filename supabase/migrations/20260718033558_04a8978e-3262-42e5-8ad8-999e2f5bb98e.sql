ALTER TABLE public.profiles DISABLE TRIGGER prevent_profile_privilege_escalation;
UPDATE public.profiles SET is_founder = true
WHERE id IN ('2cb7decb-a320-485d-ae36-7618c3b5361d','87b490de-db56-4d87-b81f-22e75cda1677');
ALTER TABLE public.profiles ENABLE TRIGGER prevent_profile_privilege_escalation;