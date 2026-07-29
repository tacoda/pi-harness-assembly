Load the `triage-playbook` skill and run a triage pass over the logs
mounted at `/logs`.

If I gave you a focus (a service name, a time window, a user id), scope
your grep and reads to that. Otherwise sweep everything.

End with the one-line count summary. Do not attempt to fix anything —
this harness only writes incident records.
