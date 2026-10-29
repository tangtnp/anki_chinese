"""Pure concurrency rules, tested independently from Anki/Qt."""
import hashlib

def fingerprint(card):
    values=[card.id,card.reps,card.mod,card.due,card.ivl,card.queue,card.type,card.lapses]
    return hashlib.sha256(':'.join(map(str,values)).encode()).hexdigest()[:24]

def decision(event,card,previous=None):
    if previous and previous.get('status')=='started':
        return 'conflict','An earlier sync was interrupted. Check this card’s Anki history; the phone review was not replayed.'
    if card.queue<0:
        return 'conflict','This card is suspended or buried on Mac. Its schedule was kept.'
    if card.reps!=event['expected_reps']:
        return 'conflict','This card was reviewed on Mac or another device. The newer Anki schedule was kept.'
    # Fingerprint is available after the first Mac snapshot. Later phone reviews of
    # the same card use reps ordering instead, since Anki changes the fingerprint.
    expected=event.get('expected_fingerprint')
    if expected and not event.get('_skip_fingerprint') and fingerprint(card)!=expected:
        return 'conflict','This card’s schedule changed on Mac. The Anki schedule was kept.'
    return 'apply',None
